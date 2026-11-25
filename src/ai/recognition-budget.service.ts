import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertStudioApproved } from 'src/image-enhancement/brand-studio.config';
import { assertFalStudioSource, falStudioLimits } from 'src/image-enhancement/fal-studio.config';
import { Prisma, ProductRecognitionTask, ProductImageEnhancementJob } from '@prisma/client';
import {
  enhancementSettings,
  assertEditingApproved,
  isStudioMode,
} from 'src/image-enhancement/enhancement.config';
import { PrismaService } from 'src/prisma/prisma.service';
import { aiSettings, assertGeminiApproved } from './ai.config';
import { ProviderOutput } from './recognition.provider';
import { prepaidStudioEvidence } from 'src/image-enhancement/prepaid-studio-policy';
import {
  assertStudioLibraryApproved,
  assertStudioLibrarySource,
} from 'src/image-enhancement/studio-library.config';
import {
  isLibraryStudioMode,
  STUDIO_FAITHFUL_JOB,
  STUDIO_HERO_JOB,
  type StudioSelection,
} from 'src/image-enhancement/studio-templates';

@Injectable()
export class RecognitionBudgetService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async reserve(task: ProductRecognitionTask) {
    const s = aiSettings(this.config);
    if (task.provider === 'gemini') assertGeminiApproved(this.config);
    const reserve =
      task.provider === 'mock'
        ? new Prisma.Decimal(0)
        : s.inputRate
            .mul(s.inputCeiling)
            .add(s.outputRate.mul(s.outputCeiling))
            .div(1000000)
            .toDecimalPlaces(9, Prisma.Decimal.ROUND_UP);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(660061)) q`;
      const old = await tx.recognitionUsage.findUnique({
        where: { taskId_attempt: { taskId: task.id, attempt: task.attempts } },
      });
      if (old) throw new Error('AI_ATTEMPT_ALREADY_RESERVED');
      const now = new Date(),
        day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        hour = new Date(now.getTime() - 3600000);
      const [global, employee, model, hourly, monthly, daily, active] = await Promise.all([
        tx.recognitionUsage.count({ where: { purpose: 'RECOGNITION', createdAt: { gte: day } } }),
        tx.recognitionUsage.count({
          where: { purpose: 'RECOGNITION', actorId: task.actorId, createdAt: { gte: day } },
        }),
        tx.recognitionUsage.count({
          where: { purpose: 'RECOGNITION', model: task.model, createdAt: { gte: day } },
        }),
        tx.recognitionUsage.count({
          where: { purpose: 'RECOGNITION', actorId: task.actorId, createdAt: { gte: hour } },
        }),
        tx.recognitionUsage.aggregate({
          where: { provider: { in: ['gemini', 'fal'] }, createdAt: { gte: month } },
          _sum: { committedUsd: true },
        }),
        tx.recognitionUsage.aggregate({
          where: { provider: { in: ['gemini', 'fal'] }, createdAt: { gte: day } },
          _sum: { committedUsd: true },
        }),
        tx.recognitionUsage.count({ where: { status: 'RESERVED' } }),
      ]);
      if (
        global >= s.daily ||
        employee >= s.employeeDaily ||
        model >= s.modelDaily ||
        hourly >= s.hourly
      )
        throw new Error('AI_QUOTA_EXCEEDED');
      if (active >= s.concurrency) throw new Error('AI_CONCURRENCY_LIMIT');
      if (
        task.provider === 'gemini' &&
        (reserve.add(monthly._sum.committedUsd ?? 0).gt(s.monthly) ||
          reserve.add(daily._sum.committedUsd ?? 0).gt(s.dailyBudget))
      )
        throw new Error('AI_BUDGET_EXCEEDED');
      return tx.recognitionUsage.create({
        data: {
          taskId: task.id,
          actorId: task.actorId,
          provider: task.provider,
          model: task.model,
          attempt: task.attempts,
          reservedUsd: reserve,
          committedUsd: reserve,
          inputRateUsd: s.inputRate,
          outputRateUsd: s.outputRate,
        },
      });
    });
  }
  async settle(id: string, output: ProviderOutput | null, latencyMs: number, errorCode?: string) {
    const usage = await this.db.recognitionUsage.findUniqueOrThrow({ where: { id } });
    // Unreported token components retain the full reservation. Never manufacture actual invoice charges.
    const known =
      output &&
      output.inputTokens !== null &&
      output.outputTokens !== null &&
      output.thinkingTokens !== null;
    const estimate =
      usage.provider === 'mock'
        ? new Prisma.Decimal(0)
        : known
          ? usage.inputRateUsd
              .mul(output.inputTokens!)
              .add(usage.outputRateUsd.mul(output.outputTokens! + output.thinkingTokens!))
              .div(1000000)
              .toDecimalPlaces(9, Prisma.Decimal.ROUND_UP)
          : null;
    await this.db.recognitionUsage.update({
      where: { id },
      data: {
        status: output ? 'REPORTED' : 'UNKNOWN',
        estimatedUsd: estimate,
        committedUsd: estimate ?? usage.reservedUsd,
        inputTokens: output?.inputTokens,
        outputTokens: output?.outputTokens,
        thinkingTokens: output?.thinkingTokens,
        latencyMs,
        errorCode,
        completedAt: new Date(),
      },
    });
  }
  async summary(actorId?: string) {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const where = {
      purpose: 'RECOGNITION',
      createdAt: { gte: since },
      status: { not: 'SYNTHETIC_LEDGER_TEST' },
      ...(actorId ? { actorId } : {}),
    };
    const [totals, failures, cacheHits, computationReuses, requests] = await Promise.all([
      this.db.recognitionUsage.aggregate({
        where,
        _count: true,
        _sum: {
          committedUsd: true,
          estimatedUsd: true,
          inputTokens: true,
          outputTokens: true,
          thinkingTokens: true,
        },
      }),
      this.db.recognitionUsage.groupBy({
        by: ['errorCode'],
        where: { ...where, errorCode: { not: null } },
        _count: true,
      }),
      this.db.auditLog.count({
        where: {
          action: 'product_intake.recognition_requested',
          createdAt: { gte: since },
          ...(actorId ? { actorId } : {}),
          metadata: { path: ['cacheHit'], equals: true },
        },
      }),
      this.db.auditLog.count({
        where: {
          action: 'product_intake.recognition_requested',
          createdAt: { gte: since },
          ...(actorId ? { actorId } : {}),
          metadata: { path: ['computationReused'], equals: true },
        },
      }),
      this.db.productRecognitionRequest.count({
        where: { createdAt: { gte: since }, ...(actorId ? { actorId } : {}) },
      }),
    ]);
    return {
      period: 'UTC_MONTH',
      totals,
      failures,
      requests,
      cacheHits,
      computationReuses,
      actualBilling: 'NOT_AVAILABLE',
      automaticFallback: false,
    };
  }
  async releaseBeforeDispatch(id: string, errorCode: string) {
    await this.db.recognitionUsage.update({
      where: { id },
      data: {
        status: 'NOT_DISPATCHED',
        committedUsd: 0,
        estimatedUsd: 0,
        errorCode,
        completedAt: new Date(),
      },
    });
  }
  async reserveImage(job: ProductImageEnhancementJob) {
    const library = isLibraryStudioMode(job.mode),
      selection = (job.parameters as { studioSelection?: StudioSelection }).studioSelection;
    const librarySettings = library ? assertStudioLibraryApproved(this.config, selection!) : null;
    const e = enhancementSettings(this.config),
      s = aiSettings(this.config),
      studio =
        librarySettings ??
        (isStudioMode(job.mode)
          ? assertStudioApproved(
              this.config,
              (job.parameters as { stylePreset?: string }).stylePreset,
            )
          : null);
    if (!studio) assertEditingApproved(this.config);
    const provider = studio ?? e;
    if (
      provider.provider !== job.provider ||
      provider.model !== job.model ||
      provider.revision !== job.modelRevision
    )
      throw new Error('IMAGE_CONFIG_CHANGED');
    if (
      studio &&
      (job.parameters as { styleHash?: string }).styleHash &&
      (job.parameters as { styleHash: string }).styleHash !== studio.styleHash
    )
      throw Error('IMAGE_CONFIG_CHANGED');
    const reserve = job.provider === 'mock' ? new Prisma.Decimal(0) : provider.reserve;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(660061)) q`;
      if (
        await tx.recognitionUsage.findUnique({
          where: { enhancementJobId_attempt: { enhancementJobId: job.id, attempt: job.attempts } },
        })
      )
        throw new Error('AI_ATTEMPT_ALREADY_RESERVED');
      const now = new Date(),
        day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        hour = new Date(now.getTime() - 3600000);
      const paid = { provider: { in: ['fal', 'gemini'] } };
      const [
        monthly,
        daily,
        imageMonthly,
        imageDaily,
        requests,
        employee,
        hourly,
        active,
        imageActive,
      ] = await Promise.all([
        tx.recognitionUsage.aggregate({
          where: { ...paid, createdAt: { gte: month } },
          _sum: { committedUsd: true },
        }),
        tx.recognitionUsage.aggregate({
          where: { ...paid, createdAt: { gte: day } },
          _sum: { committedUsd: true },
        }),
        tx.recognitionUsage.aggregate({
          where: { ...paid, purpose: 'IMAGE_EDIT', createdAt: { gte: month } },
          _sum: { committedUsd: true },
        }),
        tx.recognitionUsage.aggregate({
          where: { ...paid, purpose: 'IMAGE_EDIT', createdAt: { gte: day } },
          _sum: { committedUsd: true },
        }),
        tx.recognitionUsage.count({ where: { purpose: 'IMAGE_EDIT', createdAt: { gte: day } } }),
        tx.recognitionUsage.count({
          where: { purpose: 'IMAGE_EDIT', actorId: job.actorId, createdAt: { gte: day } },
        }),
        tx.recognitionUsage.count({
          where: { purpose: 'IMAGE_EDIT', actorId: job.actorId, createdAt: { gte: hour } },
        }),
        tx.recognitionUsage.count({ where: { status: 'RESERVED' } }),
        tx.recognitionUsage.count({ where: { purpose: 'IMAGE_EDIT', status: 'RESERVED' } }),
      ]);
      if (requests >= e.daily || employee >= e.employeeDaily || hourly >= e.hourly)
        throw new Error('AI_QUOTA_EXCEEDED');
      if (active >= s.concurrency || imageActive >= e.concurrency)
        throw new Error('AI_CONCURRENCY_LIMIT');
      if (studio) {
        const studioWhere = {
          purpose: 'IMAGE_EDIT',
          provider: job.provider === 'fal' ? 'fal' : 'gemini',
          enhancementJob: {
            mode: library ? { in: [STUDIO_FAITHFUL_JOB, STUDIO_HERO_JOB] } : job.mode,
          },
        };
        const [total, monthTotal, busy] = await Promise.all([
          tx.recognitionUsage.aggregate({ where: studioWhere, _sum: { committedUsd: true } }),
          tx.recognitionUsage.aggregate({
            where: { ...studioWhere, createdAt: { gte: month } },
            _sum: { committedUsd: true },
          }),
          tx.recognitionUsage.count({ where: { ...studioWhere, status: 'RESERVED' } }),
        ]);
        if (busy >= studio.concurrency) throw new Error('AI_CONCURRENCY_LIMIT');
        if (librarySettings && job.provider === 'fal') {
          assertStudioLibrarySource(
            this.config,
            job.sourceHash,
            (job.parameters as { maskHash: string }).maskHash,
            selection!.processingMode,
            (job.parameters as { referenceKind?: string }).referenceKind,
          );
          const [perPair, totalCalls, unknown] = await Promise.all([
            tx.recognitionUsage.count({
              where: {
                purpose: 'IMAGE_EDIT',
                provider: 'fal',
                status: { not: 'NOT_DISPATCHED' },
                enhancementJob: {
                  sourceHash: job.sourceHash,
                  mode: { in: [STUDIO_FAITHFUL_JOB, STUDIO_HERO_JOB] },
                  parameters: {
                    path: ['studioSelection', 'templateId'],
                    equals: selection!.templateId,
                  },
                },
              },
            }),
            tx.recognitionUsage.count({
              where: { ...studioWhere, status: { not: 'NOT_DISPATCHED' } },
            }),
            tx.recognitionUsage.count({
              where: {
                purpose: 'IMAGE_EDIT',
                provider: 'fal',
                status: { in: ['RESERVED', 'UNKNOWN'] },
              },
            }),
          ]);
          if (
            perPair >= 1 ||
            totalCalls >= Number(this.config.get('PRODUCT_STUDIO_MAX_REQUESTS')) ||
            job.generation !== 0
          )
            throw Error('STUDIO_LIVE_REQUEST_LIMIT');
          if (unknown) throw Error('STUDIO_UNRECONCILED_PRIOR_REQUEST');
          const prepaid = prepaidStudioEvidence(this.config);
          if (
            prepaid &&
            reserve
              .add(total._sum.committedUsd ?? 0)
              .add(prepaid.carry)
              .gt(prepaid.balance)
          )
            throw Error('STUDIO_PREPAID_BALANCE_INSUFFICIENT');
          if (
            reserve
              .add(daily._sum.committedUsd ?? 0)
              .add(librarySettings.carry)
              .gt(librarySettings.daily) ||
            reserve
              .add(monthly._sum.committedUsd ?? 0)
              .add(librarySettings.carry)
              .gt(librarySettings.monthly)
          )
            throw Error('AI_BUDGET_EXCEEDED');
        } else if (job.provider === 'fal') {
          assertFalStudioSource(
            this.config,
            job.sourceHash,
            (job.parameters as { maskHash: string }).maskHash,
          );
          const limits = falStudioLimits(this.config);
          const [perSource, totalCalls] = await Promise.all([
            tx.recognitionUsage.count({
              where: {
                purpose: 'IMAGE_EDIT',
                provider: 'fal',
                status: { not: 'NOT_DISPATCHED' },
                enhancementJob: {
                  mode: job.mode,
                  sourceHash: job.sourceHash,
                  ...(limits.stylePilot
                    ? {
                        parameters: {
                          path: ['stylePreset'],
                          equals: (job.parameters as { stylePreset: string }).stylePreset,
                        },
                      }
                    : {}),
                },
              },
            }),
            tx.recognitionUsage.count({
              where: { purpose: 'IMAGE_EDIT', provider: 'fal', status: { not: 'NOT_DISPATCHED' } },
            }),
          ]);
          if (perSource >= 1 || totalCalls >= limits.maxRequests || job.generation !== 0)
            throw new Error('FAL_PILOT_REQUEST_LIMIT');
          if (
            reserve
              .add(daily._sum.committedUsd ?? 0)
              .add(limits.carryCommitment)
              .gt(limits.daily) ||
            reserve
              .add(monthly._sum.committedUsd ?? 0)
              .add(limits.carryCommitment)
              .gt(limits.monthly)
          )
            throw new Error('AI_BUDGET_EXCEEDED');
        }
        if (
          job.provider !== 'mock' &&
          (reserve.add(total._sum.committedUsd ?? 0).gt(studio.pilot) ||
            reserve.add(monthTotal._sum.committedUsd ?? 0).gt(studio.monthly))
        )
          throw new Error('AI_BUDGET_EXCEEDED');
      }
      if (
        job.provider !== 'mock' &&
        (reserve.add(monthly._sum.committedUsd ?? 0).gt(s.monthly) ||
          reserve.add(daily._sum.committedUsd ?? 0).gt(s.dailyBudget) ||
          reserve.add(imageMonthly._sum.committedUsd ?? 0).gt(e.monthly) ||
          reserve.add(imageDaily._sum.committedUsd ?? 0).gt(e.dailyBudget))
      )
        throw new Error('AI_BUDGET_EXCEEDED');
      return tx.recognitionUsage.create({
        data: {
          enhancementJobId: job.id,
          purpose: 'IMAGE_EDIT',
          actorId: job.actorId,
          provider: job.provider,
          model: job.model,
          attempt: job.attempts,
          reservedUsd: reserve,
          committedUsd: reserve,
          inputRateUsd: studio && job.provider === 'gemini' ? '0.25' : 0,
          outputRateUsd: studio && job.provider === 'gemini' ? '30' : 0,
          usageDetails: {
            pricing: 'CONSERVATIVE_REQUEST_CEILING',
            resolution: '1024',
            modelRevision: job.modelRevision,
            ...(librarySettings
              ? {
                  mode: job.mode,
                  studioSelection: selection,
                  promptHash: librarySettings.promptHash,
                  styleHash: librarySettings.styleHash,
                  reviewedPricing:
                    (librarySettings.pricing as unknown as Prisma.InputJsonObject) ?? null,
                  fullReservationRetained: true,
                  actualCharge: 'UNKNOWN_UNTIL_RECONCILED',
                }
              : {}),
            ...(studio && !library && job.provider !== 'fal'
              ? {
                  mode: job.mode,
                  styleHash: (job.parameters as { styleHash: string }).styleHash,
                  inputRatePerMillionUsd: '0.25',
                  textOutputRatePerMillionUsd: '1.50',
                  imageOutputRatePerMillionUsd: '30.00',
                  inputTokenCeiling: 65536,
                  outputTokenCeiling: 4096,
                  reviewedBy: 'OPERATOR_GATE_REQUIRED',
                  fullReservationRetained: true,
                }
              : {}),
            ...(studio && !library && job.provider === 'fal'
              ? {
                  mode: job.mode,
                  styleHash: (job.parameters as { styleHash: string }).styleHash,
                  inputRatePerMillionUsd: '0.3125',
                  textOutputRatePerMillionUsd: '1.875',
                  imageOutputRatePerMillionUsd: '37.50',
                  inputTokenCeiling: 65536,
                  outputTokenCeiling: 4096,
                  fullReservationRetained: true,
                  pilotInitialOnly: true,
                }
              : {}),
          },
        },
      });
    });
  }
  async settleImage(
    id: string,
    reported: boolean,
    latencyMs: number,
    details: Prisma.InputJsonObject,
    errorCode?: string,
  ) {
    // Image-token/invoice reconciliation is not verified. Retain the full ceiling, even on success.
    const old = await this.db.recognitionUsage.findUniqueOrThrow({ where: { id } });
    const u = details.providerUsage as
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          thoughtsTokenCount?: number;
          imageOutputTokens?: number;
          textOutputTokens?: number;
        }
      | undefined;
    const complete =
      old.model === 'gemini-3.1-flash-lite-image' &&
      u &&
      [
        u.promptTokenCount,
        u.candidatesTokenCount,
        u.thoughtsTokenCount,
        u.imageOutputTokens,
        u.textOutputTokens,
      ].every(Number.isSafeInteger) &&
      u.imageOutputTokens! + u.textOutputTokens! === u.candidatesTokenCount;
    const fal = details.falBilling as { estimatedChargedUsd?: string | null } | undefined;
    const estimate =
      fal?.estimatedChargedUsd && /^\d+(\.\d+)?$/.test(fal.estimatedChargedUsd)
        ? new Prisma.Decimal(fal.estimatedChargedUsd).toDecimalPlaces(9, Prisma.Decimal.ROUND_CEIL)
        : complete
          ? new Prisma.Decimal(u.promptTokenCount!)
              .mul('.25')
              .add(new Prisma.Decimal(u.imageOutputTokens!).mul(30))
              .add(new Prisma.Decimal(u.textOutputTokens! + u.thoughtsTokenCount!).mul('1.5'))
              .div(1000000)
              .toDecimalPlaces(9, Prisma.Decimal.ROUND_CEIL)
          : undefined;
    await this.db.recognitionUsage.update({
      where: { id },
      data: {
        status: reported ? 'REPORTED' : 'UNKNOWN',
        latencyMs,
        errorCode,
        usageDetails: { ...(old.usageDetails as object), ...details },
        ...(u
          ? {
              inputTokens: u.promptTokenCount,
              outputTokens: u.candidatesTokenCount,
              thinkingTokens: u.thoughtsTokenCount,
            }
          : {}),
        ...(estimate ? { estimatedUsd: estimate } : {}),
        completedAt: new Date(),
      },
    });
  }
}

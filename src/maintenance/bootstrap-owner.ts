import 'dotenv/config';

import { ActorType, AdminRole, Prisma, PrismaClient, StaffStatus } from '@prisma/client';
import { isEmail } from 'class-validator';
import { OWNER_PERMISSIONS } from 'src/common/constants/permissions.constants';
import { assertPasswordPolicy } from 'src/common/security/password-policy';
import { PasswordService } from 'src/common/security/password.service';

class OwnerAlreadyExistsError extends Error {}

type BootstrapInput = {
  email: string;
  name: string;
  password: string;
};

const validateInput = (input: BootstrapInput) => {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!isEmail(email)) throw new Error('BOOTSTRAP_OWNER_EMAIL is invalid');
  if (!name || name.length > 120) throw new Error('BOOTSTRAP_OWNER_NAME must be 1-120 characters');
  assertPasswordPolicy(input.password);

  return { email, name, password: input.password };
};

const ownerWhere: Prisma.AdminUserWhereInput = {
  OR: [{ isOwner: true }, { role: AdminRole.OWNER }],
};

export async function bootstrapInitialOwner(
  prisma: PrismaClient,
  passwordService: PasswordService,
  rawInput: BootstrapInput,
) {
  const input = validateInput(rawInput);
  let passwordHash: string;
  try {
    passwordHash = await passwordService.hash(input.password);
  } finally {
    input.password = '';
    rawInput.password = '';
  }

  return prisma.$transaction(
    async (tx) => {
      const existingOwnerCount = await tx.adminUser.count({ where: ownerWhere });
      if (existingOwnerCount > 0) throw new OwnerAlreadyExistsError();

      const existingAdmin = await tx.adminUser.findUnique({
        where: { normalizedEmail: input.email },
        select: { id: true },
      });
      const commonData = {
        name: input.name,
        displayName: input.name,
        email: input.email,
        normalizedEmail: input.email,
        passwordHash,
        role: AdminRole.OWNER,
        permissions: [...OWNER_PERMISSIONS],
        deniedPermissions: [],
        isActive: true,
        status: StaffStatus.ACTIVE,
        isOwner: true,
        mustChangePassword: true,
        refreshTokenHash: null,
        passwordChangedAt: new Date(),
      };

      const owner = existingAdmin
        ? await tx.adminUser.update({
            where: { id: existingAdmin.id },
            data: { ...commonData, tokenVersion: { increment: 1 } },
            select: { id: true, email: true, isOwner: true, isActive: true, status: true, mustChangePassword: true },
          })
        : await tx.adminUser.create({
            data: commonData,
            select: { id: true, email: true, isOwner: true, isActive: true, status: true, mustChangePassword: true },
          });

      if (existingAdmin) {
        await tx.adminSession.updateMany({
          where: { adminUserId: owner.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: ActorType.SYSTEM,
          action: 'OWNER_BOOTSTRAPPED',
          summary: 'Initial owner established by guarded local maintenance command',
          entityType: 'AdminUser',
          entityId: owner.id,
          metadata: {
            mechanism: existingAdmin ? 'PROMOTED_EXISTING_ADMIN' : 'CREATED_NEW_OWNER',
            mandatoryPasswordChange: true,
          },
        },
      });

      const finalOwnerCount = await tx.adminUser.count({ where: ownerWhere });
      if (finalOwnerCount !== 1) throw new Error('Owner bootstrap invariant failed');

      return {
        ...owner,
        mechanism: existingAdmin ? 'PROMOTED_EXISTING_ADMIN' : 'CREATED_NEW_OWNER',
        ownerCount: finalOwnerCount,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function main() {
  const prisma = new PrismaClient();
  const passwordService = new PasswordService();
  let password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? '';

  try {
    const email = process.env.BOOTSTRAP_OWNER_EMAIL ?? '';
    const name = process.env.BOOTSTRAP_OWNER_NAME ?? '';
    if (!email || !name || !password) throw new Error('Required owner bootstrap environment values are missing');

    delete process.env.BOOTSTRAP_OWNER_PASSWORD;
    const input = { email, name, password };
    password = '';
    const result = await bootstrapInitialOwner(prisma, passwordService, input);
    console.log(
      JSON.stringify({
        ok: true,
        mechanism: result.mechanism,
        email: result.email,
        ownerCount: result.ownerCount,
        active: result.isActive && result.status === StaffStatus.ACTIVE,
        mustChangePassword: result.mustChangePassword,
      }),
    );
  } catch (error) {
    if (error instanceof OwnerAlreadyExistsError) {
      console.error('Owner bootstrap refused: an owner already exists.');
    } else {
      console.error('Owner bootstrap failed safely.');
    }
    process.exitCode = 1;
  } finally {
    password = '';
    delete process.env.BOOTSTRAP_OWNER_PASSWORD;
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();

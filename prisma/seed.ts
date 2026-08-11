import 'dotenv/config';
import { AdminRole, PrismaClient, StaffStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { OWNER_PERMISSIONS } from '../src/common/constants/permissions.constants';
import { PERMISSIONS_CATALOG } from '../src/permissions/permissions.catalog';

const prisma = new PrismaClient();

const ownerPermissions = [...OWNER_PERMISSIONS];

const catalog = PERMISSIONS_CATALOG.flatMap((group) => group.permissions);
const keysFor = (...groups: string[]) =>
  catalog
    .filter((item) => groups.includes(item.module) && item.assignable && !item.dangerous)
    .map((item) => item.key);
const defaultRoles = [
  {
    name: 'Store Manager',
    description: 'Non-security store operations',
    permissionKeys: [
      ...keysFor(
        'dashboard',
        'customers',
        'categories',
        'products',
        'auctions',
        'shipping',
        'reports',
      ),
    ],
  },
  {
    name: 'Product Manager',
    description: 'Product catalog operations',
    permissionKeys: [...keysFor('products', 'categories')],
  },
  {
    name: 'Auction Manager',
    description: 'Auction operations',
    permissionKeys: [...keysFor('auctions')],
  },
  {
    name: 'Warehouse Staff',
    description: 'Warehouse and labels',
    permissionKeys: [...keysFor('warehouse', 'labels')],
  },
  {
    name: 'Shipping Staff',
    description: 'Shipping operations',
    permissionKeys: [...keysFor('shipping')],
  },
  {
    name: 'Customer Support',
    description: 'Customer and verification support',
    permissionKeys: [...keysFor('customers', 'notifications')],
  },
  {
    name: 'Marketing Manager',
    description: 'Ads and read-only reporting',
    permissionKeys: [...keysFor('ads', 'reports')],
  },
  {
    name: 'Influencer Manager',
    description: 'Influencer and commission read operations',
    permissionKeys: [...keysFor('influencers', 'commissions')],
  },
  {
    name: 'Reports Viewer',
    description: 'Read-only reporting',
    permissionKeys: [...keysFor('reports')],
  },
];

const defaultCategories = ['Electronics', 'Clothes', 'Home', 'Tools', 'Cosmetics', 'Misc'];

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 'app_settings_singleton' },
    create: {
      id: 'app_settings_singleton',
      storeName: process.env.STORE_NAME ?? 'Single Store',
      storePhone: process.env.STORE_PHONE,
      storeAddress: process.env.STORE_ADDRESS,
      currency: 'IQD',
      allowUnverifiedPurchase: true,
      unverifiedPurchaseLimit: 0,
      allowUnverifiedBidding: true,
      unverifiedBidLimit: 0,
      defaultAuctionExtensionSeconds: 180,
      defaultAuctionExtensionTriggerSeconds: 60,
      defaultLiveAuctionResetSeconds: 10,
      defaultLongAuctionExtensionSeconds: 180,
      auctionEndingSoonNotifyMinutes: 5,
      maxAuctionExtensions: 20,
      labelTemplate: {
        version: 1,
        size: '70x40mm',
        fields: ['storeName', 'customerName', 'price', 'categoryName', 'barcode', 'soldAt'],
      },
      shippingRequestEnabled: true,
    },
    update: {},
  });

  for (const name of defaultCategories) {
    await prisma.category.upsert({
      where: { slug: toSlug(name) },
      create: {
        name,
        slug: toSlug(name),
        isActive: true,
        sortOrder: defaultCategories.indexOf(name),
      },
      update: {},
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await prisma.adminUser.upsert({
      where: { normalizedEmail: adminEmail.toLowerCase() },
      create: {
        name: process.env.SEED_ADMIN_NAME ?? 'Store Owner',
        email: adminEmail.toLowerCase(),
        normalizedEmail: adminEmail.toLowerCase(),
        displayName: process.env.SEED_ADMIN_NAME ?? 'Store Owner',
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        role: AdminRole.OWNER,
        permissions: ownerPermissions,
        deniedPermissions: [],
        isActive: true,
        status: StaffStatus.ACTIVE,
        isOwner: true,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
      update: {
        role: AdminRole.OWNER,
        permissions: ownerPermissions,
        isOwner: true,
        status: StaffStatus.ACTIVE,
        isActive: true,
      },
    });
  }

  for (const role of defaultRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: { ...role, isSystem: true, isActive: true },
      update: {
        description: role.description,
        permissionKeys: role.permissionKeys,
        isSystem: true,
        isActive: true,
      },
    });
  }

  if (process.env.SEED_DEMO_CUSTOMERS === 'true') {
    await prisma.customer.upsert({
      where: { phone: '+9647700000000' },
      create: {
        displayName: 'Demo Customer',
        phone: '+9647700000000',
        whatsappPhone: '+9647700000000',
        status: 'ACTIVE',
        verificationStatus: 'UNVERIFIED',
        isVirtual: false,
        box: { create: {} },
        notificationSettings: { create: {} },
      },
      update: {},
    });

    await prisma.customer.create({
      data: {
        displayName: 'TikTok Demo',
        tiktokUsername: '@demo_live',
        status: 'VIRTUAL',
        verificationStatus: 'UNVERIFIED',
        isVirtual: true,
        box: { create: {} },
        notificationSettings: { create: {} },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

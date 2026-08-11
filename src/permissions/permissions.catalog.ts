import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { PermissionCatalogGroupDto } from 'src/permissions/dto/permission-catalog.dto';

const permission = (
  key: string,
  labelAr: string,
  labelEn: string,
  descriptionAr: string,
  descriptionEn: string,
  dangerous = false,
) => ({
  key,
  labelAr,
  labelEn,
  descriptionAr,
  descriptionEn,
  dangerous,
  module: key.split('.')[0],
  action: key.split('.').slice(1).join('.') || 'manage',
  labelKey: `permissions.${key.replace(/\./g, '_')}`,
  riskLevel: (key === PERMISSIONS.ADMIN_USERS_MANAGE ? 'OWNER_ONLY' : dangerous ? 'DANGEROUS' : 'NORMAL') as 'NORMAL' | 'SENSITIVE' | 'DANGEROUS' | 'OWNER_ONLY',
  ownerOnly: key === PERMISSIONS.ADMIN_USERS_MANAGE,
  assignable: key !== PERMISSIONS.ADMIN_USERS_MANAGE,
  sortOrder: 0,
});

export const PERMISSIONS_CATALOG: PermissionCatalogGroupDto[] = [
  {
    group: 'dashboard',
    labelAr: 'لوحة التحكم',
    labelEn: 'Dashboard',
    permissions: [
      permission(
        PERMISSIONS.DASHBOARD_VIEW,
        'مشاهدة لوحة التحكم',
        'View dashboard',
        'يسمح للموظف بمشاهدة مؤشرات لوحة التحكم',
        'Allows viewing dashboard metrics',
      ),
      permission(
        PERMISSIONS.REPORTS_READ,
        'مشاهدة التقارير',
        'View reports',
        'يسمح للموظف بمشاهدة التقارير',
        'Allows viewing reports',
      ),
    ],
  },
  {
    group: 'products',
    labelAr: 'المنتجات',
    labelEn: 'Products',
    permissions: [
      permission(
        PERMISSIONS.PRODUCTS_VIEW,
        'مشاهدة المنتجات',
        'View products',
        'يسمح للموظف بمشاهدة المنتجات',
        'Allows viewing products',
      ),
      permission(
        PERMISSIONS.PRODUCTS_CREATE,
        'إنشاء المنتجات',
        'Create products',
        'يسمح للموظف بإنشاء منتجات جديدة',
        'Allows creating products',
      ),
      permission(
        PERMISSIONS.PRODUCTS_EDIT,
        'تعديل المنتجات',
        'Edit products',
        'يسمح للموظف بتعديل بيانات المنتجات',
        'Allows editing products',
      ),
      permission(
        PERMISSIONS.PRODUCTS_PUBLISH,
        'نشر المنتجات',
        'Publish products',
        'يسمح للموظف بنشر المنتجات للعملاء',
        'Allows publishing products',
      ),
      permission(
        PERMISSIONS.PRODUCTS_CANCEL,
        'إلغاء المنتجات',
        'Cancel products',
        'يسمح للموظف بإلغاء المنتجات',
        'Allows cancelling products',
        true,
      ),
      permission(
        PERMISSIONS.PRODUCTS_UPLOAD_IMAGES,
        'رفع صور المنتجات',
        'Upload product images',
        'يسمح للموظف برفع صور للمنتجات',
        'Allows uploading product images',
      ),
      permission(
        PERMISSIONS.PRODUCTS_CHANGE_PRICE,
        'تغيير سعر المنتج',
        'Change product price',
        'يسمح للموظف بتغيير أسعار المنتجات',
        'Allows changing product prices',
        true,
      ),
      permission(
        PERMISSIONS.PRODUCTS_MANAGE,
        'إدارة المنتجات',
        'Manage products',
        'صلاحية الإدارة القديمة للمنتجات',
        'Legacy broad product management permission',
        true,
      ),
    ],
  },
  {
    group: 'auctions',
    labelAr: 'المزادات',
    labelEn: 'Auctions',
    permissions: [
      permission(
        PERMISSIONS.AUCTIONS_VIEW,
        'مشاهدة المزادات',
        'View auctions',
        'يسمح للموظف بمشاهدة المزادات',
        'Allows viewing auctions',
      ),
      permission(
        PERMISSIONS.AUCTIONS_CREATE,
        'إنشاء المزادات',
        'Create auctions',
        'يسمح للموظف بإنشاء مزادات جديدة',
        'Allows creating auctions',
      ),
      permission(
        PERMISSIONS.AUCTIONS_EDIT,
        'تعديل المزادات',
        'Edit auctions',
        'يسمح للموظف بتعديل المزادات',
        'Allows editing auctions',
      ),
      permission(
        PERMISSIONS.AUCTIONS_PUBLISH,
        'نشر المزادات',
        'Publish auctions',
        'يسمح للموظف بنشر المزادات',
        'Allows publishing auctions',
      ),
      permission(
        PERMISSIONS.AUCTIONS_CANCEL,
        'إلغاء المزادات',
        'Cancel auctions',
        'يسمح للموظف بإلغاء المزادات',
        'Allows cancelling auctions',
        true,
      ),
      permission(
        PERMISSIONS.AUCTIONS_CLOSE_NOW,
        'إغلاق المزاد الآن',
        'Close auction now',
        'يسمح للموظف بإغلاق المزاد فوراً',
        'Allows immediately closing auctions',
        true,
      ),
      permission(
        PERMISSIONS.AUCTIONS_VIEW_BIDS,
        'مشاهدة المزايدات',
        'View bids',
        'يسمح للموظف بمشاهدة مزايدات المزاد',
        'Allows viewing auction bids',
      ),
      permission(
        PERMISSIONS.AUCTIONS_VIEW_BIDDER_INFO,
        'مشاهدة بيانات المزايدين',
        'View bidder info',
        'يسمح للموظف بمشاهدة معلومات المزايدين',
        'Allows viewing bidder information',
        true,
      ),
      permission(
        PERMISSIONS.AUCTIONS_CHANGE_TIMER,
        'تعديل وقت المزاد',
        'Change auction timer',
        'يسمح للموظف بتعديل توقيت المزاد',
        'Allows changing auction timers',
        true,
      ),
      permission(
        PERMISSIONS.AUCTIONS_CHANGE_MIN_INCREMENT,
        'تعديل أقل زيادة',
        'Change minimum increment',
        'يسمح للموظف بتعديل أقل زيادة للمزايدة',
        'Allows changing minimum bid increments',
        true,
      ),
      permission(
        PERMISSIONS.AUCTIONS_MANAGE,
        'إدارة المزادات',
        'Manage auctions',
        'صلاحية الإدارة القديمة للمزادات',
        'Legacy broad auction management permission',
        true,
      ),
    ],
  },
  {
    group: 'notifications',
    labelAr: 'الإشعارات',
    labelEn: 'Notifications',
    permissions: [
      permission(
        PERMISSIONS.NOTIFICATIONS_VIEW,
        'مشاهدة الإشعارات',
        'View notifications',
        'يسمح للموظف بمشاهدة الإشعارات',
        'Allows viewing notifications',
      ),
      permission(
        PERMISSIONS.NOTIFICATIONS_SEND,
        'إرسال إشعارات للعملاء',
        'Send customer notifications',
        'يسمح للموظف بإرسال إشعارات داخل التطبيق للعملاء',
        'Allows sending persisted in-app notifications to customers',
        true,
      ),
      permission(
        PERMISSIONS.NOTIFICATIONS_MANAGE_SETTINGS,
        'إدارة إعدادات الإشعارات',
        'Manage notification settings',
        'يسمح للموظف بإدارة إعدادات الإشعارات',
        'Allows managing notification settings',
      ),
    ],
  },
  {
    group: 'customers',
    labelAr: 'العملاء',
    labelEn: 'Customers',
    permissions: [
      permission(PERMISSIONS.CUSTOMERS_READ, 'مشاهدة العملاء', 'View customers', 'يسمح بمشاهدة العملاء', 'Allows viewing customers'),
      permission(PERMISSIONS.CUSTOMERS_CREATE, 'إنشاء العملاء', 'Create customers', 'يسمح بإنشاء العملاء', 'Allows creating customers'),
      permission(PERMISSIONS.CUSTOMERS_UPDATE, 'تعديل العملاء', 'Edit customers', 'يسمح بتعديل العملاء', 'Allows editing customers'),
      permission(PERMISSIONS.CUSTOMERS_VERIFY, 'توثيق العملاء', 'Verify customers', 'يسمح بتوثيق العملاء', 'Allows verifying customers'),
      permission(PERMISSIONS.CUSTOMERS_BLOCK, 'حظر العملاء', 'Block customers', 'يسمح بحظر العملاء', 'Allows blocking customers', true),
    ],
  },
  {
    group: 'sales',
    labelAr: 'المبيعات',
    labelEn: 'Sales',
    permissions: [
      permission(PERMISSIONS.SALES_QUICK_CREATE, 'بيع سريع', 'Quick sale', 'يسمح بإنشاء بيع سريع', 'Allows creating quick sales'),
      permission(PERMISSIONS.SALES_CANCEL, 'إلغاء المبيعات', 'Cancel sales', 'يسمح بإلغاء المبيعات', 'Allows cancelling sales', true),
      permission(PERMISSIONS.SALES_SESSIONS_MANAGE, 'إدارة جلسات البيع', 'Manage sales sessions', 'يسمح بإدارة جلسات البيع', 'Allows managing sales sessions'),
    ],
  },
  {
    group: 'labels',
    labelAr: 'الملصقات',
    labelEn: 'Labels',
    permissions: [
      permission(PERMISSIONS.WAREHOUSE_PRINT_LABEL, 'طباعة الملصقات', 'Print labels', 'يسمح بطباعة الملصقات', 'Allows printing labels'),
      permission(PERMISSIONS.WAREHOUSE_CONFIRM_LABEL, 'تأكيد الملصق', 'Confirm label', 'يسمح بتأكيد إلصاق الملصق', 'Allows confirming labels'),
    ],
  },
  {
    group: 'warehouse',
    labelAr: 'المخزن',
    labelEn: 'Warehouse',
    permissions: [
      permission(PERMISSIONS.WAREHOUSE_READ, 'مشاهدة المخزن', 'View warehouse', 'يسمح بمشاهدة المخزن', 'Allows viewing warehouse'),
      permission(PERMISSIONS.WAREHOUSE_SEARCH, 'بحث المخزن', 'Search warehouse', 'يسمح بالبحث في المخزن', 'Allows searching warehouse'),
      permission(PERMISSIONS.WAREHOUSE_PRINT_LABEL, 'طباعة من المخزن', 'Print from warehouse', 'يسمح بطباعة ملصقات المخزن', 'Allows warehouse label printing'),
      permission(PERMISSIONS.WAREHOUSE_CONFIRM_LABEL, 'تأكيد من المخزن', 'Confirm warehouse labels', 'يسمح بتأكيد ملصقات المخزن', 'Allows confirming warehouse labels'),
    ],
  },
  {
    group: 'shipping',
    labelAr: 'الشحن',
    labelEn: 'Shipping',
    permissions: [
      permission(PERMISSIONS.SHIPPING_MANAGE, 'إدارة الشحن', 'Manage shipping', 'يسمح بإدارة طلبات الشحن', 'Allows managing shipping'),
    ],
  },
  {
    group: 'screens',
    labelAr: 'الشاشات',
    labelEn: 'Screens',
    permissions: [
      permission(PERMISSIONS.SCREENS_MANAGE, 'إدارة الشاشات', 'Manage screens', 'يسمح بإدارة شاشات العرض', 'Allows managing screen devices'),
    ],
  },
  {
    group: 'categories',
    labelAr: 'التصنيفات',
    labelEn: 'Categories',
    permissions: [
      permission(PERMISSIONS.CATEGORIES_MANAGE, 'إدارة التصنيفات', 'Manage categories', 'يسمح بإدارة التصنيفات', 'Allows managing categories'),
    ],
  },
  {
    group: 'settings',
    labelAr: 'الإعدادات',
    labelEn: 'Settings',
    permissions: [
      permission(PERMISSIONS.SETTINGS_MANAGE, 'إدارة الإعدادات', 'Manage settings', 'يسمح بإدارة إعدادات المتجر', 'Allows managing store settings', true),
    ],
  },
  {
    group: 'staff',
    labelAr: 'الموظفون',
    labelEn: 'Staff',
    permissions: [
      permission(PERMISSIONS.ADMIN_USERS_MANAGE, 'إدارة الموظفين', 'Manage staff', 'يسمح بإدارة حسابات الموظفين', 'Allows managing staff accounts', true),
    ],
  },
  {
    group: 'reports',
    labelAr: 'التقارير',
    labelEn: 'Reports',
    permissions: [
      permission(PERMISSIONS.REPORTS_READ, 'مشاهدة التقارير', 'View reports', 'يسمح بمشاهدة التقارير', 'Allows viewing reports'),
      permission(PERMISSIONS.AUDIT_LOGS_READ, 'مشاهدة سجل التدقيق', 'View audit logs', 'يسمح بمشاهدة سجل التدقيق', 'Allows viewing audit logs'),
    ],
  },
  {
    group: 'influencers',
    labelAr: 'المؤثرون',
    labelEn: 'Influencers',
    permissions: [
      permission(PERMISSIONS.INFLUENCERS_MANAGE, 'إدارة المؤثرين', 'Manage influencers', 'يسمح بإدارة المؤثرين', 'Allows managing influencers'),
    ],
  },
  {
    group: 'ads',
    labelAr: 'الإعلانات',
    labelEn: 'Ads',
    permissions: [
      permission(PERMISSIONS.ADS_MANAGE, 'إدارة الإعلانات', 'Manage ads', 'يسمح بإدارة الإعلانات', 'Allows managing in-app ads'),
    ],
  },
  {
    group: 'commissions',
    labelAr: 'العمولات',
    labelEn: 'Commissions',
    permissions: [
      permission(PERMISSIONS.COMMISSIONS_MANAGE, 'إدارة العمولات', 'Manage commissions', 'يسمح بإدارة العمولات', 'Allows managing commissions', true),
    ],
  },
];

const addCatalogPermissions = (groupName: string, entries: ReturnType<typeof permission>[]) => {
  const group = PERMISSIONS_CATALOG.find((candidate) => candidate.group === groupName);
  if (group) group.permissions.push(...entries);
};

addCatalogPermissions('auctions', [
  permission(PERMISSIONS.AUCTIONS_SET_VIP, 'تعيين المزاد كمميز', 'Mark auction as VIP', 'يسمح بتحديد المزاد كعنصر مميز يظهر بأولوية', 'Allows setting an auction as a priority VIP item', true),
]);

addCatalogPermissions('shipping', [
  permission(PERMISSIONS.SHIPPING_SHIP, 'شحن الطلب', 'Ship request', 'يسمح بتأكيد شحن طلبات الشحن', 'Allows shipping requests', true),
]);
addCatalogPermissions('settings', [
  permission(PERMISSIONS.SETTINGS_SECURITY, 'أمن الإعدادات', 'Security settings', 'يسمح بتعديل إعدادات الأمان الحساسة', 'Allows changing sensitive security settings', true),
]);
addCatalogPermissions('staff', [
  permission(PERMISSIONS.STAFF_VIEW, 'View staff', 'View staff', 'Allows viewing staff accounts', 'Allows viewing staff accounts'),
  permission(PERMISSIONS.STAFF_CREATE, 'Create staff', 'Create staff', 'Allows creating staff accounts', 'Allows creating staff accounts'),
  permission(PERMISSIONS.STAFF_EDIT, 'Edit staff', 'Edit staff', 'Allows editing staff profiles', 'Allows editing staff profiles'),
  permission(PERMISSIONS.STAFF_ACTIVATE, 'Activate staff', 'Activate staff', 'Allows activating staff accounts', 'Allows activating staff accounts'),
  permission(PERMISSIONS.STAFF_DEACTIVATE, 'Deactivate staff', 'Deactivate staff', 'Allows deactivating staff accounts', 'Allows deactivating staff accounts', true),
  permission(PERMISSIONS.STAFF_LOCK, 'Lock staff', 'Lock staff', 'Allows locking staff accounts', 'Allows locking staff accounts', true),
  permission(PERMISSIONS.STAFF_UNLOCK, 'Unlock staff', 'Unlock staff', 'Allows unlocking staff accounts', 'Allows unlocking staff accounts'),
  permission(PERMISSIONS.STAFF_RESET_PASSWORD, 'Reset staff password', 'Reset staff password', 'Allows administrative password reset', 'Allows administrative password reset', true),
  permission(PERMISSIONS.STAFF_MANAGE_PERMISSIONS, 'Manage staff permissions', 'Manage staff permissions', 'Allows assigning roles and permissions', 'Allows assigning staff roles and permissions', true),
  permission(PERMISSIONS.STAFF_MANAGE_SESSIONS, 'Manage staff sessions', 'Manage staff sessions', 'Allows viewing and revoking staff sessions', 'Allows viewing and revoking staff sessions', true),
  permission(PERMISSIONS.STAFF_CHANGE_PERMISSIONS, 'تغيير الصلاحيات', 'Change permissions', 'يسمح بتغيير صلاحيات الموظفين', 'Allows changing staff permissions', true),
]);
addCatalogPermissions('reports', [
  permission(PERMISSIONS.REPORTS_VIEW, 'عرض التقارير', 'View reports', 'يسمح بعرض التقارير', 'Allows viewing reports'),
  permission(PERMISSIONS.REPORTS_SALES, 'تقرير المبيعات', 'Sales report', 'يسمح بعرض تقرير المبيعات', 'Allows viewing sales reports'),
  permission(PERMISSIONS.REPORTS_CATEGORIES, 'تقرير التصنيفات', 'Categories report', 'يسمح بعرض تقرير التصنيفات', 'Allows viewing category reports'),
  permission(PERMISSIONS.REPORTS_CUSTOMERS, 'تقرير العملاء', 'Customers report', 'يسمح بعرض تقرير العملاء', 'Allows viewing customer reports'),
  permission(PERMISSIONS.REPORTS_WAREHOUSE, 'تقرير المخزن', 'Warehouse report', 'يسمح بعرض warehouse reports', 'Allows viewing warehouse reports'),
  permission(PERMISSIONS.REPORTS_INFLUENCERS, 'تقرير المؤثرين', 'Influencers report', 'يسمح بعرض تقارير المؤثرين', 'Allows viewing influencer reports'),
  permission(PERMISSIONS.REPORTS_AUCTIONS, 'تقرير المزادات', 'Auctions report', 'يسمح بعرض تقارير المزادات', 'Allows viewing auction reports'),
]);
PERMISSIONS_CATALOG.push({
  group: 'roles',
  labelAr: 'Roles',
  labelEn: 'Roles',
  permissions: [
    permission(PERMISSIONS.ROLES_VIEW, 'View roles', 'View roles', 'Allows viewing roles', 'Allows viewing roles'),
    permission(PERMISSIONS.ROLES_CREATE, 'Create roles', 'Create roles', 'Allows creating roles', 'Allows creating roles'),
    permission(PERMISSIONS.ROLES_EDIT, 'Edit roles', 'Edit roles', 'Allows editing roles', 'Allows editing roles'),
    permission(PERMISSIONS.ROLES_ACTIVATE, 'Activate roles', 'Activate roles', 'Allows activating roles', 'Allows activating roles'),
    permission(PERMISSIONS.ROLES_DEACTIVATE, 'Deactivate roles', 'Deactivate roles', 'Allows deactivating roles', 'Allows deactivating roles', true),
    permission(PERMISSIONS.ROLES_MANAGE_PERMISSIONS, 'Manage role permissions', 'Manage role permissions', 'Allows changing role permissions', 'Allows changing role permissions', true),
  ],
});

addCatalogPermissions('commissions', [
  permission(PERMISSIONS.AUDIT_LOGS_VIEW, 'View audit logs', 'View audit logs', 'Allows viewing security audit logs', 'Allows viewing security audit logs', true),
  permission(PERMISSIONS.COMMISSIONS_MARK_PAID, 'تسديد العمولات', 'Mark commissions paid', 'يسمح بتعليم العمولات كمدفوعة', 'Allows marking commissions paid', true),
]);

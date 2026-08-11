import { OWNER_PERMISSIONS } from 'src/common/constants/permissions.constants';

export type PermissionResolutionInput = {
  owner?: boolean;
  rolePermissionSets?: string[][];
  directGrants?: string[];
  directDenies?: string[];
};

/** Deterministic RBAC resolution: role grants + direct grants - direct denies. */
export const resolveEffectivePermissions = (input: PermissionResolutionInput): string[] => {
  if (input.owner) {
    return [...OWNER_PERMISSIONS].sort();
  }

  const grants = new Set<string>();
  for (const set of input.rolePermissionSets ?? []) {
    for (const permission of set) grants.add(permission);
  }
  for (const permission of input.directGrants ?? []) grants.add(permission);
  for (const permission of input.directDenies ?? []) grants.delete(permission);
  return [...grants].sort();
};

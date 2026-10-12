export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: number | null;
}

export function actorInfo(user: AuthUser) {
  return {
    actorId: Number(user.id),
    actorName: user.name,
    actorRole: user.roleName ?? null,
  };
}

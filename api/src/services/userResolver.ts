export type ResolvedUser = {
  userObjectId: string;
  displayName: string | null;
  email: string | null;
};

export interface UserResolver {
  resolveByEmail(tenantId: string, email: string): Promise<ResolvedUser>;
}

export const organizationMembershipStatuses = [
  "pending",
  "active",
  "revoked",
] as const;

export const organizationRoles = ["client_member"] as const;

export const staffAuthorities = ["staff_admin"] as const;

export type OrganizationMembershipStatus =
  (typeof organizationMembershipStatuses)[number];
export type OrganizationRole = (typeof organizationRoles)[number];
export type StaffAuthority = (typeof staffAuthorities)[number];

export type ApplicationUser = {
  id: string;
  authUserId: string;
  email: string;
  createdAt: Date;
};

export type OrganizationMembership = {
  organizationId: string;
  applicationUserId: string;
  role: OrganizationRole;
  status: OrganizationMembershipStatus;
  createdAt: Date;
  activatedAt: Date | null;
  revokedAt: Date | null;
};

export type OrganizationInvitation = {
  id: string;
  organizationId: string;
  invitedByApplicationUserId: string;
  invitedEmail: string;
  role: OrganizationRole;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  replacedAt: Date | null;
  replacementInvitationId: string | null;
};

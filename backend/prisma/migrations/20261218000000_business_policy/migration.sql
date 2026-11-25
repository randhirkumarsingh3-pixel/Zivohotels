-- ZivoPlus for Business: a member's travel policy grade, approver and cost centre
ALTER TABLE "OrgMember" ADD COLUMN "grade" TEXT;
ALTER TABLE "OrgMember" ADD COLUMN "approverMemberId" TEXT;
ALTER TABLE "OrgMember" ADD COLUMN "costCenter" TEXT;

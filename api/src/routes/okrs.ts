import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { listOkrsWithSummary, listOkrsWithSummaryForUser } from "../repos/okrBoardRepo";
import { getOkrDetail } from "../repos/okrDetailRepo";
import { createOkr, deleteOkrCascade, getOkrDeleteInfo, okrExists } from "../repos/okrRepo";
import { getOkrInsightsByOkrId } from "../repos/insightsRepo";
import { ensureInitialOkrInsights, recomputeKrAndOkrInsights } from "../services/insights";
import { createKr } from "../repos/krRepo";
import { aiValidateOkr, ruleValidateOkr } from "../services/aiOkr";
import { computeOkrFingerprint } from "../services/validationFingerprint";
import {
  addAlignment,
  hasAlignmentPath,
  listAlignedFrom,
  listAlignedTo,
  removeAlignment,
} from "../repos/okrAlignmentRepo";
import { validateAlignmentRules } from "../services/okrAlignment";
import {
  addOkrMember,
  countOkrOwners,
  deleteOkrMember,
  getOkrMember,
  listOkrMembers,
  updateOkrMemberRole,
} from "../repos/okrMembersRepo";
import {
  canDelete,
  canEdit,
  canManageMembers,
  canView,
  ensureRoleForWrite,
  getAuthzMode,
  resolveRoleForOkr,
} from "../services/authz";
import { buildOwnerMember, canRemoveOwner } from "../services/okrMembers";
import { GraphUserResolver, maskEmail } from "../services/graphUserResolver";
import { addMemberByEmail } from "../services/okrMembersByEmail";

const router = Router();

router.use(requireAuth, requireTenant);

function respondForbidden(res: any) {
  return res.status(403).json({ error: "forbidden", code: "forbidden", message: "No tenes permisos." });
}

function respondNotMember(res: any) {
  return res
    .status(404)
    .json({ error: "not_member", code: "not_member", message: "No tenes acceso a este OKR." });
}

router.get("/", async (req, res) => {
  const mode = getAuthzMode();
  const okrs =
    mode === "members_only"
      ? await listOkrsWithSummaryForUser(req.tenantId!, req.userId!)
      : await listOkrsWithSummary(req.tenantId!, req.userId!);
  const enriched = okrs.map((okr) => ({
    ...okr,
    myRole: okr.myRole ?? (mode === "tenant_open" ? "viewer" : null),
  }));
  res.json(enriched);
});

router.get("/:okrId/delete-info", async (req, res) => {
  const okrId = req.params.okrId;
  const role = await resolveRoleForOkr(req.tenantId!, okrId, req.userId!);
  if (!canView(role, getAuthzMode())) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  const info = await getOkrDeleteInfo(req.tenantId!, okrId);
  if (!info) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  res.set("Cache-Control", "no-store");
  res.json(info);
});

router.delete("/:okrId", async (req, res, next) => {
  const okrId = req.params.okrId;
  try {
    const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
    if (!role) {
      return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
    }
    if (!canDelete(role)) {
      return respondForbidden(res);
    }
    const info = await getOkrDeleteInfo(req.tenantId!, okrId);
    if (!info) {
      return res
        .status(404)
        .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
    }
    console.log("[okrs] delete", {
      okrId,
      tenantId: req.tenantId,
      krCount: info.krCount,
      checkinsCount: info.checkinsCount,
    });
    await deleteOkrCascade(req.tenantId!, okrId);
    res.json({ ok: true, deleted: info });
  } catch (err) {
    next(err);
  }
});

router.get("/:okrId", async (req, res) => {
  const okrId = req.params.okrId;
  const role = await resolveRoleForOkr(req.tenantId!, okrId, req.userId!);
  if (!canView(role, getAuthzMode())) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  const detail = await getOkrDetail(req.tenantId!, okrId);
  if (!detail) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  res.json({
    ...detail,
    myRole: role ?? (getAuthzMode() === "tenant_open" ? "viewer" : null),
  });
});

router.get("/:okrId/alignments", async (req, res) => {
  const okrId = req.params.okrId;
  const role = await resolveRoleForOkr(req.tenantId!, okrId, req.userId!);
  if (!canView(role, getAuthzMode())) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  const okrOk = await okrExists(req.tenantId!, okrId);
  if (!okrOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const [alignedTo, alignedFrom] = await Promise.all([
    listAlignedTo(req.tenantId!, okrId),
    listAlignedFrom(req.tenantId!, okrId),
  ]);
  res.json({ alignedTo, alignedFrom });
});

router.post("/:okrId/alignments", async (req, res) => {
  const okrId = req.params.okrId;
  const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  if (!canEdit(role)) {
    return respondForbidden(res);
  }
  const { targetOkrId } = req.body ?? {};
  if (!targetOkrId) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }
  const okrOk = await okrExists(req.tenantId!, okrId);
  const targetOk = await okrExists(req.tenantId!, String(targetOkrId));
  if (!okrOk || !targetOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const pathExists = await hasAlignmentPath(req.tenantId!, okrId, String(targetOkrId));
  const validationError = validateAlignmentRules(String(targetOkrId), okrId, pathExists);
  if (validationError === "self_link") {
    return res
      .status(400)
      .json({ error: "self_link", code: "self_link", message: "No podes alinear un OKR consigo mismo." });
  }
  if (validationError === "cycle_detected") {
    return res
      .status(400)
      .json({ error: "cycle_detected", code: "cycle_detected", message: "La alineacion generaria un ciclo." });
  }
  console.log("[okrs] alignment add", {
    tenantId: req.tenantId,
    parentOkrId: String(targetOkrId),
    childOkrId: okrId,
  });
  await addAlignment(req.tenantId!, String(targetOkrId), okrId);
  res.status(201).json({ ok: true });
});

router.delete("/:okrId/alignments/:parentOkrId", async (req, res) => {
  const okrId = req.params.okrId;
  const parentOkrId = req.params.parentOkrId;
  const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  if (!canEdit(role)) {
    return respondForbidden(res);
  }
  console.log("[okrs] alignment remove", {
    tenantId: req.tenantId,
    parentOkrId,
    childOkrId: okrId,
  });
  await removeAlignment(req.tenantId!, parentOkrId, okrId);
  res.json({ ok: true });
});

router.get("/:okrId/members", async (req, res) => {
  const okrId = req.params.okrId;
  const okrOk = await okrExists(req.tenantId!, okrId);
  if (!okrOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const role = await resolveRoleForOkr(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  if (!canEdit(role)) {
    return respondForbidden(res);
  }
  const members = await listOkrMembers(req.tenantId!, okrId);
  const payload = members.map((member) => ({
    ...member,
    isSelf: member.userObjectId.toLowerCase() === req.userId!.toLowerCase(),
  }));
  res.json(payload);
});

router.post("/:okrId/members", async (req, res) => {
  const okrId = req.params.okrId;
  const okrOk = await okrExists(req.tenantId!, okrId);
  if (!okrOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  if (!canManageMembers(role)) {
    return respondForbidden(res);
  }
  const { userObjectId, role: memberRole } = req.body ?? {};
  if (!userObjectId || !memberRole) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }
  if (!["owner", "editor", "viewer"].includes(String(memberRole))) {
    return res
      .status(400)
      .json({ error: "invalid_role", code: "invalid_role", message: "Rol invalido." });
  }
  const result = await addOkrMember({
    tenantId: req.tenantId!,
    okrId,
    userObjectId: String(userObjectId),
    role: String(memberRole) as any,
    createdBy: req.userId,
  });
  if (result === "exists") {
    return res
      .status(409)
      .json({ error: "member_exists", code: "member_exists", message: "Ya es miembro." });
  }
  res.status(201).json({ ok: true });
});

router.post("/:okrId/members/by-email", async (req, res) => {
  const okrId = req.params.okrId;
  const okrOk = await okrExists(req.tenantId!, okrId);
  if (!okrOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  const { email, role: memberRole } = req.body ?? {};
  if (!email || !memberRole) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }
  if (!["owner", "editor", "viewer"].includes(String(memberRole))) {
    return res
      .status(400)
      .json({ error: "invalid_role", code: "invalid_role", message: "Rol invalido." });
  }

  const startedAt = Date.now();
  const resolver = new GraphUserResolver();
  try {
    const result = await addMemberByEmail(
      {
        tenantId: req.tenantId!,
        okrId,
        actorRole: role,
        actorUserId: req.userId!,
        email: String(email),
        role: String(memberRole) as any,
      },
      {
        resolver,
        addMember: addOkrMember,
      }
    );
    const latencyMs = Date.now() - startedAt;
    console.log("[okrs] add_member_by_email", {
      tenantId: req.tenantId,
      okrId,
      action: "add_member_by_email",
      result: result.status,
      latencyMs,
      email: maskEmail(String(email)),
      error: result.status !== 201 ? (result.body as any)?.error : undefined,
    });
    if (result.status === 201) {
      console.log("[okrs] add_member_by_email resolved", {
        tenantId: req.tenantId,
        okrId,
        actorUserId: req.userId,
        memberUserObjectId: result.body.userObjectId,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const message = String(err?.message || "");
    console.log("[okrs] add_member_by_email", {
      tenantId: req.tenantId,
      okrId,
      action: "add_member_by_email",
      result: "error",
      latencyMs,
      email: maskEmail(String(email)),
      error: message,
    });
    return res.status(502).json({ error: "graph_unavailable" });
  }
});

router.patch("/:okrId/members/:userObjectId", async (req, res) => {
  const okrId = req.params.okrId;
  const targetUserId = req.params.userObjectId;
  const okrOk = await okrExists(req.tenantId!, okrId);
  if (!okrOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  if (!canManageMembers(role)) {
    return respondForbidden(res);
  }
  const { role: memberRole } = req.body ?? {};
  if (!memberRole) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }
  if (!["owner", "editor", "viewer"].includes(String(memberRole))) {
    return res
      .status(400)
      .json({ error: "invalid_role", code: "invalid_role", message: "Rol invalido." });
  }
  const targetMember = await getOkrMember(req.tenantId!, okrId, targetUserId);
  if (!targetMember) {
    return res
      .status(404)
      .json({ error: "member_not_found", code: "not_found", message: "Miembro no encontrado." });
  }
  if (targetMember.role === "owner" && memberRole !== "owner") {
    const ownerCount = await countOkrOwners(req.tenantId!, okrId);
    if (!canRemoveOwner(ownerCount, targetMember.role)) {
      console.log("[okrs] owner_required", {
        tenantId: req.tenantId,
        okrId,
        targetUserId,
        action: "update_member_role",
        ownerCount,
      });
      return res.status(400).json({ error: "owner_required", code: "owner_required", message: "Debe quedar al menos un owner." });
    }
  }
  await updateOkrMemberRole({
    tenantId: req.tenantId!,
    okrId,
    userObjectId: targetUserId,
    role: String(memberRole) as any,
  });
  res.json({ ok: true });
});

router.delete("/:okrId/members/:userObjectId", async (req, res) => {
  const okrId = req.params.okrId;
  const targetUserId = req.params.userObjectId;
  const okrOk = await okrExists(req.tenantId!, okrId);
  if (!okrOk) {
    return res
      .status(404)
      .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
  }
  const role = await ensureRoleForWrite(req.tenantId!, okrId, req.userId!);
  if (!role) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  if (!canManageMembers(role)) {
    return respondForbidden(res);
  }
  const targetMember = await getOkrMember(req.tenantId!, okrId, targetUserId);
  if (!targetMember) {
    return res
      .status(404)
      .json({ error: "member_not_found", code: "not_found", message: "Miembro no encontrado." });
  }
  if (targetMember.role === "owner") {
    const ownerCount = await countOkrOwners(req.tenantId!, okrId);
    if (!canRemoveOwner(ownerCount, targetMember.role)) {
      console.log("[okrs] owner_required", {
        tenantId: req.tenantId,
        okrId,
        targetUserId,
        action: "delete_member",
        ownerCount,
      });
      return res.status(400).json({ error: "owner_required", code: "owner_required", message: "Debe quedar al menos un owner." });
    }
  }
  await deleteOkrMember({
    tenantId: req.tenantId!,
    okrId,
    userObjectId: targetUserId,
  });
  res.json({ ok: true });
});

router.get("/:okrId/insights", async (req, res) => {
  const okrId = req.params.okrId;
  const role = await resolveRoleForOkr(req.tenantId!, okrId, req.userId!);
  if (!canView(role, getAuthzMode())) {
    return getAuthzMode() === "members_only" ? respondNotMember(res) : respondForbidden(res);
  }
  const insight = await getOkrInsightsByOkrId(req.tenantId!, okrId);
  if (!insight) {
    return res
      .status(404)
      .json({ error: "okr_insights_not_found", code: "not_found", message: "Insights no encontrados." });
  }
  res.json(insight);
});

router.post("/", async (req, res) => {
  const okr = await createOkr(req.tenantId!, req.body);
  await addOkrMember(buildOwnerMember({ tenantId: req.tenantId!, okrId: okr.id, userObjectId: req.userId! }));
  await ensureInitialOkrInsights(req.tenantId!, okr.id);
  res.status(201).json(okr);
});

router.post("/with-krs", async (req, res) => {
  const { objective, fromDate, toDate, krs, validation, allowHigh } = req.body ?? {};
  if (!objective || !fromDate || !toDate || !Array.isArray(krs)) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const fingerprint = computeOkrFingerprint({ objective, fromDate, toDate, krs });
  const aiRequired = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";
  let appliedValidation = validation && validation.fingerprint === fingerprint ? validation : null;
  if (validation && validation.fingerprint !== fingerprint) {
    console.log("[ai] okr create validation mismatch", {
      provided: validation.fingerprint,
      expected: fingerprint,
    });
  }
  if (!appliedValidation) {
    let fresh = await aiValidateOkr({
      today: new Date().toISOString().slice(0, 10),
      objective,
      fromDate,
      toDate,
      krs,
    });
    if (!fresh) {
      if (aiRequired) {
        return res.status(502).json({ error: "ai_unavailable" });
      }
      fresh = ruleValidateOkr({
        objective,
        fromDate,
        toDate,
        krs: krs.map((kr: any) => ({ title: kr.title, targetValue: kr.targetValue })),
      });
    }
    appliedValidation = { ...fresh, fingerprint };
  }

  const hasHigh = appliedValidation.issues?.some((i: { severity?: string }) => i.severity === "high");
  console.log("[ai] okr create validation", {
    hasHigh,
    allowHigh: !!allowHigh,
  });
  if (hasHigh && !allowHigh) {
    return res.status(400).json({ error: "ai_validation_failed", issues: appliedValidation.issues });
  }

  const okr = await createOkr(req.tenantId!, { objective, fromDate, toDate });
  await addOkrMember(buildOwnerMember({ tenantId: req.tenantId!, okrId: okr.id, userObjectId: req.userId! }));
  await ensureInitialOkrInsights(req.tenantId!, okr.id);

  const createdKrs = [];
  for (const kr of krs) {
    if (!kr.title || kr.targetValue === null || kr.targetValue === undefined) {
      return res.status(400).json({ error: "kr_target_missing" });
    }
    const created = await createKr({
      okrId: okr.id,
      title: String(kr.title),
      metricName: kr.metricName ?? null,
      targetValue: Number(kr.targetValue),
      unit: kr.unit ?? null,
    });
    createdKrs.push(created);
    await recomputeKrAndOkrInsights(req.tenantId!, created.id);
  }

  res.status(201).json({ okr, krs: createdKrs, validation: appliedValidation });
});

export default router;

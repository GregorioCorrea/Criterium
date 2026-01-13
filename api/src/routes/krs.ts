import { Router } from "express";
import {
  createKr,
  deleteKrCascade,
  getKrById,
  getKrDeleteInfo,
  listKrsByOkr,
  updateKrCurrentValue,
} from "../repos/krRepo";
import { createCheckin, listCheckinsByKr } from "../repos/checkinRepo";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { okrExists } from "../repos/okrRepo";
import { getKrInsightsByKrId } from "../repos/insightsRepo";
import { recomputeKrAndOkrInsights, recomputeOkrInsights } from "../services/insights";
import { computeProgressPct } from "../domain/krHealth";
import { aiValidateKr, ruleValidateKr } from "../services/aiOkr";
import {
  canDelete,
  canEdit,
  canView,
  ensureRoleForWrite,
  getAuthzMode,
  resolveRoleForOkr,
} from "../services/authz";

const router = Router();

router.use(requireAuth, requireTenant);

function logAuthzDenied(req: any, action: string, result: "forbidden" | "not_member") {
  console.log("[authz] denied", {
    tenantId: req.tenantId,
    userObjectId: req.userId,
    okrId: req.params?.okrId ?? req.body?.okrId ?? null,
    krId: req.params?.krId ?? null,
    action,
    mode: getAuthzMode(),
    result,
  });
}

function respondForbidden(req: any, res: any, action: string) {
  logAuthzDenied(req, action, "forbidden");
  return res.status(403).json({ error: "forbidden", code: "forbidden", message: "No tenes permisos." });
}

function respondNotMember(req: any, res: any, action: string) {
  logAuthzDenied(req, action, "not_member");
  return res
    .status(404)
    .json({ error: "not_member", code: "not_member", message: "No tenes acceso a este OKR." });
}

function allowsNegativeValue(unit?: string | null): boolean {
  if (!unit) return false;
  return /delta|variacion|variación|cambio|diff|neto/i.test(unit);
}

// GET /krs/:okrId -> lista KRs del OKR
router.get("/:okrId", async (req, res, next) => {
  try {
    const role = await resolveRoleForOkr(req.tenantId!, req.params.okrId, req.userId!);
    if (!canView(role, getAuthzMode())) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "krs_list")
        : respondForbidden(req, res, "krs_list");
    }
    const rows = await listKrsByOkr(req.tenantId!, req.params.okrId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /krs -> crea KR
router.post("/", async (req, res, next) => {
  try {
    const { okrId, title, metricName, targetValue, unit, allowHigh } = req.body ?? {};

    if (!okrId || !title) {
      return res
        .status(400)
        .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
    }
    if (targetValue === null || targetValue === undefined || Number.isNaN(Number(targetValue))) {
      return res
        .status(400)
        .json({ error: "kr_target_missing", code: "kr_target_missing", message: "El targetValue es obligatorio." });
    }

    const okrOk = await okrExists(req.tenantId!, String(okrId));
    if (!okrOk) {
      return res
        .status(404)
        .json({ error: "okr_not_found", code: "not_found", message: "OKR no encontrado." });
    }
    const role = await ensureRoleForWrite(req.tenantId!, String(okrId), req.userId!);
    if (!role) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "kr_create")
        : respondForbidden(req, res, "kr_create");
    }
    if (!canEdit(role)) {
      return respondForbidden(req, res, "kr_create");
    }

    const aiRequired = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";
    let validation = await aiValidateKr({ title, metricName, unit, targetValue: Number(targetValue) });
    if (!validation) {
      if (aiRequired) {
        return res
          .status(502)
          .json({ error: "ai_unavailable", code: "ai_unavailable", message: "IA no disponible." });
      }
      validation = ruleValidateKr({ title, targetValue: Number(targetValue) });
    }
    const hasHigh = validation.issues?.some((i) => i.severity === "high");
    console.log("[krs] create validation", {
      hasHigh,
      allowHigh: !!allowHigh,
    });
    if (hasHigh && !allowHigh) {
      return res.status(400).json({
        error: "ai_validation_failed",
        code: "ai_validation_failed",
        message: "Hay issues que bloquean la creacion.",
        issues: validation.issues,
      });
    }

    const created = await createKr({
      okrId: String(okrId),
      title,
      metricName,
      targetValue: Number(targetValue),
      unit,
    });

    await recomputeKrAndOkrInsights(req.tenantId!, created.id);
    console.log("[event] kr_created", {
      tenantId: req.tenantId,
      userObjectId: req.userId,
      okrId: String(okrId),
      krId: created.id,
      action: "kr_created",
      result: "success",
    });

    res.status(201).json({ ...created, validation });
  } catch (err) {
    next(err);
  }
});

// GET /krs/:krId/checkins
router.get("/:krId/checkins", async (req, res, next) => {
  const krId = req.params.krId;
  if (!krId || krId.trim().length < 10) {
    return res.status(400).json({ error: "kr_invalid", code: "kr_invalid", message: "KR invalido." });
  }
  try {
    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res
        .status(404)
        .json({ error: "kr_not_found", code: "not_found", message: "KR no encontrado." });
    }
    const role = await resolveRoleForOkr(req.tenantId!, kr.okrId, req.userId!);
    if (!canView(role, getAuthzMode())) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "checkins_list")
        : respondForbidden(req, res, "checkins_list");
    }
    const rows = await listCheckinsByKr(req.tenantId!, req.params.krId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /krs/:krId/checkins
router.post("/:krId/checkins", async (req, res, next) => {
  const krId = req.params.krId;
  if (!krId || krId.trim().length < 10) {
    return res.status(400).json({ error: "kr_invalid", code: "kr_invalid", message: "KR invalido." });
  }
  try {
    const { value, comment, date } = req.body ?? {};

    const numericValue = Number(value);
    if (value === undefined || value === null || Number.isNaN(numericValue)) {
      return res
        .status(400)
        .json({ error: "value_required", code: "value_required", message: "El valor es obligatorio." });
    }

    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res
        .status(404)
        .json({ error: "kr_not_found", code: "not_found", message: "KR no encontrado." });
    }
    const role = await ensureRoleForWrite(req.tenantId!, kr.okrId, req.userId!);
    if (!role) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "checkin_create")
        : respondForbidden(req, res, "checkin_create");
    }
    if (!canEdit(role)) {
      return respondForbidden(req, res, "checkin_create");
    }
    if (numericValue < 0 && !allowsNegativeValue(kr.unit)) {
      return res.status(400).json({
        error: "value_negative_not_allowed",
        code: "value_negative_not_allowed",
        message: "El valor no puede ser negativo para esta metrica.",
      });
    }
    if (date) {
      const parsed = Date.parse(String(date));
      if (!Number.isNaN(parsed) && parsed > Date.now()) {
        return res.status(400).json({
          error: "checkin_date_future",
          code: "checkin_date_future",
          message: "La fecha del check-in no puede ser futura.",
        });
      }
    }
    if (kr.targetValue !== null && kr.targetValue !== undefined) {
      const progress = computeProgressPct(kr.currentValue, kr.targetValue);
      if (progress !== null && progress >= 100) {
        return res.status(409).json({
          error: "kr_already_completed",
          code: "kr_already_completed",
          message: "El KR ya alcanzo el 100% y no acepta mas check-ins.",
        });
      }
    }

    const created = await createCheckin({
      tenantId: req.tenantId!,
      krId: req.params.krId,
      value: numericValue,
      comment: comment ?? null,
      createdByUserId: req.userId ?? null,
    });

    // Actualizamos current_value del KR al ultimo check-in
    await updateKrCurrentValue(req.tenantId!, req.params.krId, numericValue);

    await recomputeKrAndOkrInsights(req.tenantId!, req.params.krId);
    console.log("[event] checkin_created", {
      tenantId: req.tenantId,
      userObjectId: req.userId,
      okrId: kr.okrId,
      krId: req.params.krId,
      action: "checkin_created",
      result: "success",
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// GET /krs/:krId/insights
router.get("/:krId/insights", async (req, res, next) => {
  try {
    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res
        .status(404)
        .json({ error: "kr_not_found", code: "not_found", message: "KR no encontrado." });
    }
    const role = await resolveRoleForOkr(req.tenantId!, kr.okrId, req.userId!);
    if (!canView(role, getAuthzMode())) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "kr_insights")
        : respondForbidden(req, res, "kr_insights");
    }
    const insight = await getKrInsightsByKrId(req.tenantId!, req.params.krId);
    if (!insight) {
      return res
        .status(404)
        .json({ error: "kr_insights_not_found", code: "not_found", message: "Insights no encontrados." });
    }
    res.json(insight);
  } catch (err) {
    next(err);
  }
});

// GET /krs/:krId/delete-info
router.get("/:krId/delete-info", async (req, res, next) => {
  try {
    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res
        .status(404)
        .json({ error: "kr_not_found", code: "not_found", message: "KR no encontrado." });
    }
    const role = await resolveRoleForOkr(req.tenantId!, kr.okrId, req.userId!);
    if (!canView(role, getAuthzMode())) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "kr_delete_info")
        : respondForbidden(req, res, "kr_delete_info");
    }
    const info = await getKrDeleteInfo(req.tenantId!, req.params.krId);
    if (!info) {
      return res
        .status(404)
        .json({ error: "kr_not_found", code: "not_found", message: "KR no encontrado." });
    }
    res.set("Cache-Control", "no-store");
    res.json(info);
  } catch (err) {
    next(err);
  }
});

// DELETE /krs/:krId
router.delete("/:krId", async (req, res, next) => {
  try {
    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res
        .status(404)
        .json({ error: "kr_not_found", code: "not_found", message: "KR no encontrado." });
    }
    const role = await ensureRoleForWrite(req.tenantId!, kr.okrId, req.userId!);
    if (!role) {
      return getAuthzMode() === "members_only"
        ? respondNotMember(req, res, "kr_delete")
        : respondForbidden(req, res, "kr_delete");
    }
    if (!canDelete(role)) {
      return respondForbidden(req, res, "kr_delete");
    }
    const info = await getKrDeleteInfo(req.tenantId!, req.params.krId);
    console.log("[krs] delete", {
      krId: req.params.krId,
      tenantId: req.tenantId,
      checkinsCount: info?.checkinsCount ?? 0,
    });
    await deleteKrCascade(req.tenantId!, req.params.krId);
    await recomputeOkrInsights(req.tenantId!, kr.okrId);
    console.log("[event] kr_deleted", {
      tenantId: req.tenantId,
      userObjectId: req.userId,
      okrId: kr.okrId,
      krId: req.params.krId,
      action: "kr_deleted",
      result: "success",
    });
    res.json({ ok: true, deleted: info ?? { krId: kr.id, checkinsCount: 0 } });
  } catch (err) {
    next(err);
  }
});

export default router;

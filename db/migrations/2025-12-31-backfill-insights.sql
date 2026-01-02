-- Minimal backfill for KrInsights and OkrInsights (rules v1)
-- Safe to run multiple times (MERGE upsert).

-- KR insights
MERGE dbo.KrInsights AS target
USING (
  SELECT
    o.tenant_id,
    kr.id AS kr_id,
    kr.target_value,
    kr.current_value,
    CASE
      WHEN kr.target_value IS NULL OR kr.target_value <= 0 THEN 0
      ELSE 1
    END AS has_target,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM dbo.kr_checkins kc
        WHERE kc.tenant_id = o.tenant_id
          AND kc.key_result_id = kr.id
      ) THEN 1
      ELSE 0
    END AS has_checkins,
    CASE
      WHEN kr.target_value IS NULL OR kr.target_value <= 0 THEN NULL
      WHEN kr.current_value IS NULL THEN 0
      ELSE (kr.current_value / NULLIF(kr.target_value, 0)) * 100
    END AS progress_pct
  FROM dbo.key_results kr
  INNER JOIN dbo.okrs o ON o.id = kr.okr_id
) AS src
ON target.tenant_id = src.tenant_id AND target.kr_id = src.kr_id
WHEN MATCHED THEN
  UPDATE SET
    risk =
      CASE
        WHEN src.has_target = 0 THEN 'high'
        WHEN src.has_checkins = 0 THEN 'high'
        WHEN src.progress_pct < 40 THEN 'high'
        WHEN src.progress_pct < 70 THEN 'medium'
        ELSE 'low'
      END,
    explanation_short =
      CASE
        WHEN src.has_target = 0 THEN 'Sin target definido'
        WHEN src.has_checkins = 0 THEN 'Sin check-ins'
        WHEN src.progress_pct < 40 THEN 'Fuera de rumbo'
        WHEN src.progress_pct < 70 THEN 'En riesgo'
        ELSE 'En rumbo'
      END,
    explanation_long =
      CASE
        WHEN src.has_target = 0 THEN 'Este KR no tiene un target numerico definido, por lo que no se puede evaluar el avance.'
        WHEN src.has_checkins = 0 THEN 'Aun no hay check-ins registrados para este KR.'
        WHEN src.progress_pct < 40 THEN 'El progreso actual esta por debajo de 40% del target.'
        WHEN src.progress_pct < 70 THEN 'El progreso actual esta entre 40% y 70% del target.'
        ELSE 'El progreso actual supera 70% del target.'
      END,
    suggestion =
      CASE
        WHEN src.has_target = 0 THEN 'Defini un target numerico y una fecha'
        WHEN src.has_checkins = 0 THEN 'Carga el primer check-in con el valor actual'
        WHEN src.progress_pct < 40 THEN 'Defini 1-2 iniciativas y aumenta la frecuencia de check-in'
        WHEN src.progress_pct < 70 THEN 'Ajusta iniciativas y revisa el ritmo semanal'
        ELSE 'Mantene cadencia y elimina bloqueos'
      END,
    computed_at = SYSUTCDATETIME(),
    source = 'rules',
    version = 1
WHEN NOT MATCHED THEN
  INSERT (
    id, tenant_id, kr_id, risk, explanation_short, explanation_long,
    suggestion, computed_at, source, version
  )
  VALUES (
    NEWID(), src.tenant_id, src.kr_id,
    CASE
      WHEN src.has_target = 0 THEN 'high'
      WHEN src.has_checkins = 0 THEN 'high'
      WHEN src.progress_pct < 40 THEN 'high'
      WHEN src.progress_pct < 70 THEN 'medium'
      ELSE 'low'
    END,
    CASE
      WHEN src.has_target = 0 THEN 'Sin target definido'
      WHEN src.has_checkins = 0 THEN 'Sin check-ins'
      WHEN src.progress_pct < 40 THEN 'Fuera de rumbo'
      WHEN src.progress_pct < 70 THEN 'En riesgo'
      ELSE 'En rumbo'
    END,
    CASE
      WHEN src.has_target = 0 THEN 'Este KR no tiene un target numerico definido, por lo que no se puede evaluar el avance.'
      WHEN src.has_checkins = 0 THEN 'Aun no hay check-ins registrados para este KR.'
      WHEN src.progress_pct < 40 THEN 'El progreso actual esta por debajo de 40% del target.'
      WHEN src.progress_pct < 70 THEN 'El progreso actual esta entre 40% y 70% del target.'
      ELSE 'El progreso actual supera 70% del target.'
    END,
    CASE
      WHEN src.has_target = 0 THEN 'Defini un target numerico y una fecha'
      WHEN src.has_checkins = 0 THEN 'Carga el primer check-in con el valor actual'
      WHEN src.progress_pct < 40 THEN 'Defini 1-2 iniciativas y aumenta la frecuencia de check-in'
      WHEN src.progress_pct < 70 THEN 'Ajusta iniciativas y revisa el ritmo semanal'
      ELSE 'Mantene cadencia y elimina bloqueos'
    END,
    SYSUTCDATETIME(), 'rules', 1
  );

-- OKR insights (aggregate from KrInsights)
MERGE dbo.OkrInsights AS target
USING (
  SELECT
    o.tenant_id,
    o.id AS okr_id,
    COUNT(kr.id) AS kr_count,
    SUM(CASE WHEN ki.risk = 'high' THEN 1 ELSE 0 END) AS high_count,
    SUM(CASE WHEN ki.risk = 'medium' THEN 1 ELSE 0 END) AS medium_count,
    SUM(CASE WHEN ki.risk = 'low' THEN 1 ELSE 0 END) AS low_count
  FROM dbo.okrs o
  LEFT JOIN dbo.key_results kr ON kr.okr_id = o.id
  LEFT JOIN dbo.KrInsights ki
    ON ki.kr_id = kr.id AND ki.tenant_id = o.tenant_id
  GROUP BY o.tenant_id, o.id
) AS src
ON target.tenant_id = src.tenant_id AND target.okr_id = src.okr_id
WHEN MATCHED THEN
  UPDATE SET
    explanation_short =
      CASE
        WHEN src.kr_count = 0 THEN 'Sin KRs'
        WHEN src.high_count > 0 THEN 'OKR en riesgo por KR criticos'
        WHEN src.medium_count > (src.kr_count / 2) THEN 'OKR en riesgo'
        ELSE 'OKR en rumbo'
      END,
    explanation_long =
      CASE
        WHEN src.kr_count = 0 THEN 'Este OKR no tiene KRs asociados.'
        WHEN src.high_count > 0 THEN 'Hay KRs en estado critico que estan afectando el estado general del OKR.'
        WHEN src.medium_count > (src.kr_count / 2) THEN 'La mayoria de los KRs estan en riesgo.'
        ELSE 'La mayoria de los KRs estan en buen estado.'
      END,
    suggestion =
      CASE
        WHEN src.kr_count = 0 THEN 'Agrega 1-3 KRs medibles'
        WHEN src.high_count > 0 THEN 'Prioriza KRs criticos y defini iniciativas'
        WHEN src.medium_count > (src.kr_count / 2) THEN 'Revisa el ritmo y las acciones de soporte'
        ELSE 'Mantener foco y cadencia'
      END,
    computed_at = SYSUTCDATETIME(),
    source = 'rules',
    version = 1
WHEN NOT MATCHED THEN
  INSERT (
    id, tenant_id, okr_id, explanation_short, explanation_long,
    suggestion, computed_at, source, version
  )
  VALUES (
    NEWID(), src.tenant_id, src.okr_id,
    CASE
      WHEN src.kr_count = 0 THEN 'Sin KRs'
      WHEN src.high_count > 0 THEN 'OKR en riesgo por KR criticos'
      WHEN src.medium_count > (src.kr_count / 2) THEN 'OKR en riesgo'
      ELSE 'OKR en rumbo'
    END,
    CASE
      WHEN src.kr_count = 0 THEN 'Este OKR no tiene KRs asociados.'
      WHEN src.high_count > 0 THEN 'Hay KRs en estado critico que estan afectando el estado general del OKR.'
      WHEN src.medium_count > (src.kr_count / 2) THEN 'La mayoria de los KRs estan en riesgo.'
      ELSE 'La mayoria de los KRs estan en buen estado.'
    END,
    CASE
      WHEN src.kr_count = 0 THEN 'Agrega 1-3 KRs medibles'
      WHEN src.high_count > 0 THEN 'Prioriza KRs criticos y defini iniciativas'
      WHEN src.medium_count > (src.kr_count / 2) THEN 'Revisa el ritmo y las acciones de soporte'
      ELSE 'Mantener foco y cadencia'
    END,
    SYSUTCDATETIME(), 'rules', 1
  );

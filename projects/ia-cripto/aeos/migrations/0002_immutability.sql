-- Phase 0: close immutability holes found by forensic probes F3 (predictions)
-- and harden the death record (§13: cemetery is permanent, §53: resolved
-- predictions are immutable).

-- §53: a resolved prediction is immutable. The 0001 trigger only blocked
-- re-resolution; it allowed setting resolved_at back to NULL (probe F3).
DROP TRIGGER IF EXISTS predictions_no_rewrite;
CREATE TRIGGER predictions_resolved_immutable BEFORE UPDATE ON predictions
WHEN OLD.resolved_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'resolved prediction is immutable (§53)');
END;

-- Once resolved, actual/brier can never change (covered above) and an
-- unresolved row can never be resolved twice in one UPDATE because
-- resolved_at transitions NULL->set only when OLD.resolved_at IS NULL and
-- NEW.actual IS NOT NULL:
CREATE TRIGGER predictions_resolve_requires_actual BEFORE UPDATE ON predictions
WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL
     AND (NEW.actual IS NULL OR NEW.brier IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'resolution requires actual and brier');
END;

-- §13: the cemetery is permanent. Rows are never deleted; the death record
-- (category, reason, lessons) never changes after burial.
CREATE TRIGGER cemetery_no_delete BEFORE DELETE ON cemetery
BEGIN
    SELECT RAISE(ABORT, 'cemetery is permanent (§13)');
END;
CREATE TRIGGER cemetery_no_rewrite BEFORE UPDATE ON cemetery
WHEN OLD.failure_category != NEW.failure_category
     OR OLD.failure_reason != NEW.failure_reason
     OR OLD.lessons != NEW.lessons
     OR OLD.capital_in_minor != NEW.capital_in_minor
     OR OLD.revenue_minor != NEW.revenue_minor
     OR OLD.profit_minor != NEW.profit_minor
BEGIN
    SELECT RAISE(ABORT, 'death record is immutable (§13)');
END;

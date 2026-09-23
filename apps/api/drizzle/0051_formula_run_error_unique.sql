DROP INDEX IF EXISTS "run_errors_formula_unique";
CREATE UNIQUE INDEX "run_errors_formula_unique" ON "run_errors" USING btree ("run_id","category","transformer_id") WHERE "category" = 'formulaEvaluationFailure' AND "transformer_id" IS NOT NULL;

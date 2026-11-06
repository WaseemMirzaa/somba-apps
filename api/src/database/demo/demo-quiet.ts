/**
 * Import this FIRST. The seed runs the whole application context for a minute; the scheduled sweeps (return deadlines,
 * campaign and flash-sale phases, vacation, fraud, scoring, warehouse jobs) must not act on rows while the seed is still
 * moving their dates. The running API keeps its own sweeps and picks everything up afterwards.
 * Translation is NOT silenced: the seed waits for its translation jobs to finish.
 */
for (const key of ['AFTER_SALE_SWEEP_MS', 'FRAUD_SWEEP_MS', 'FLASH_SWEEP_MS', 'CAMPAIGN_SWEEP_MS', 'VACATION_SWEEP_MS', 'SELLER_SCORE_SWEEP_MS', 'WAREHOUSE_OPS_SWEEP_MS']) process.env[key] = '0';

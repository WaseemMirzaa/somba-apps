import type { CampaignStatus } from '../database/entities/campaign.entity';

/**
 * The life of a seller campaign:
 *
 *   draft ──submit──▶ pending ──approve──▶ scheduled ──(start date)──▶ active ──(end date | budget | stop)──▶ ended
 *                        │        └──────────────────────(no future start)──────▶ active
 *                        └──reject──▶ rejected ──(seller edits and resubmits)──▶ pending
 *
 * `ended` is final. A campaign is never moved backwards by hand (an approved one cannot go back to pending).
 */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ['pending', 'ended'],
  pending: ['scheduled', 'active', 'rejected', 'ended'],
  scheduled: ['active', 'ended'],
  active: ['ended'],
  ended: [],
  rejected: ['pending', 'ended'],
};

export const canMoveCampaign = (from: CampaignStatus, to: CampaignStatus): boolean => from === to || CAMPAIGN_TRANSITIONS[from].includes(to);

/** An approval picks `scheduled` while the start date is still ahead, else `active`. */
export function approvedStatus(startMs: number | null, now = Date.now()): 'scheduled' | 'active' {
  return startMs !== null && startMs > now ? 'scheduled' : 'active';
}

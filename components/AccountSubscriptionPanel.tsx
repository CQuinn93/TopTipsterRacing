import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { formatSportCompetitionStatusLabel } from '@/lib/appUtils';
import {
  fetchMySubscriptionCreatedCompetitions,
  fetchMySubscriptionJoins,
  formatCreatorTier,
  formatSubscriptionSportLabel,
  type CreatorTier,
  type ParticipantTier,
  type SubscriptionEntitlements,
  type SubscriptionUsageCompetition,
} from '@/lib/subscriptionEntitlements';

type ExpandKey = 'player' | 'organiser' | null;
type DetailKey = 'joins' | 'creates' | null;

const PARTICIPANT_PRICES: Record<ParticipantTier, string> = {
  user: 'Free',
  user_plus: '€0.99/mo',
  user_premium: '€1.99/mo',
};

const CREATOR_PRICES: Record<CreatorTier, string> = {
  creator: '€3.99/mo',
  creator_plus: '€4.99/mo',
  creator_pro: '€9.99/mo',
  gamemaster: '€19.99/mo',
};

function formatLimit(value: number | null | undefined): string {
  if (value == null) return 'Unlimited';
  return String(value);
}

function effectiveParticipantTier(ent: SubscriptionEntitlements): ParticipantTier {
  if (ent.is_owner) return 'user_premium';
  if (ent.lifetime_participant_tier) return ent.lifetime_participant_tier;
  return ent.participant_tier ?? 'user';
}

function playerPlanTitle(ent: SubscriptionEntitlements): string {
  if (ent.is_owner) return 'Owner';
  const tier = effectiveParticipantTier(ent);
  if (ent.lifetime_participant_tier === 'user_premium') return 'User Premium';
  if (tier === 'user_premium') return 'User Premium';
  if (tier === 'user_plus') return 'User Plus';
  return 'User';
}

function playerPlanSubtitle(ent: SubscriptionEntitlements): string {
  if (ent.is_owner) return 'Full access as a player';
  if (ent.lifetime_participant_tier === 'user_premium') return 'Lifetime · no payment';
  const tier = effectiveParticipantTier(ent);
  return PARTICIPANT_PRICES[tier];
}

function organiserPlanTitle(ent: SubscriptionEntitlements): string {
  if (ent.is_owner) return 'Owner';
  const tier = ent.creator_tier ?? ent.lifetime_creator_tier;
  if (!tier) return 'No organiser plan';
  if (ent.lifetime_creator_tier && !ent.creator_tier) {
    return `Lifetime ${formatCreatorTier(ent.lifetime_creator_tier)}`;
  }
  return formatCreatorTier(tier);
}

function organiserPlanSubtitle(ent: SubscriptionEntitlements): string {
  if (ent.is_owner) return 'Full access as an organiser';
  const tier = ent.creator_tier ?? ent.lifetime_creator_tier;
  if (!tier) return 'Upgrade to run competitions';
  if (ent.lifetime_creator_tier && !ent.creator_tier) return 'Lifetime · no payment';
  return CREATOR_PRICES[tier];
}

type LimitRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  expandable?: boolean;
  detailExpanded?: boolean;
  onToggleDetail?: () => void;
  detailLoading?: boolean;
  detail?: ReactNode;
};

function LimitRow({
  icon,
  label,
  value,
  hint,
  expandable,
  detailExpanded,
  onToggleDetail,
  detailLoading,
  detail,
}: LimitRowProps) {
  const theme = useTheme();
  const rowBody = (
    <View style={limitRowStyles.row}>
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} style={limitRowStyles.icon} />
      <View style={limitRowStyles.body}>
        <Text style={[limitRowStyles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
        {hint ? (
          <Text style={[limitRowStyles.hint, { color: theme.colors.textMuted }]}>{hint}</Text>
        ) : null}
      </View>
      <View style={limitRowStyles.valueWrap}>
        <Text style={[limitRowStyles.value, { color: theme.colors.text }]}>{value}</Text>
        {expandable ? (
          <Ionicons
            name={detailExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.colors.textMuted}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <View>
      {expandable ? (
        <Pressable
          onPress={onToggleDetail}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailExpanded ?? false }}
          accessibilityLabel={`${label}, ${value}`}
        >
          {rowBody}
        </Pressable>
      ) : (
        rowBody
      )}
      {detailExpanded ? (
        <View style={[limitRowStyles.detail, { borderTopColor: theme.colors.border }]}>
          {detailLoading ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} style={limitRowStyles.detailLoader} />
          ) : (
            detail
          )}
        </View>
      ) : null}
    </View>
  );
}

function formatParticipantStatus(status?: string): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === 'eliminated') return 'Eliminated';
  if (s === 'winner') return 'Winner';
  if (s === 'active') return 'Active';
  return status;
}

function CompetitionUsageList({ items }: { items: SubscriptionUsageCompetition[] }) {
  const theme = useTheme();
  const counting = items.filter((c) => c.countsTowardLimit);
  const other = items.filter((c) => !c.countsTowardLimit);

  if (items.length === 0) {
    return (
      <Text style={[limitRowStyles.emptyDetail, { color: theme.colors.textMuted }]}>
        No competitions in this list.
      </Text>
    );
  }

  const renderRow = (c: SubscriptionUsageCompetition) => {
    const participantLabel = formatParticipantStatus(c.participantStatus);
    const metaParts = [
      formatSubscriptionSportLabel(c.sport),
      formatSportCompetitionStatusLabel(c.status),
    ];
    if (participantLabel) metaParts.push(participantLabel);
    if (!c.countsTowardLimit) metaParts.push('Does not count toward limit');

    return (
      <View
        key={`${c.sport}-${c.id}`}
        style={[limitRowStyles.compRow, { borderBottomColor: theme.colors.border }]}
      >
        <Text style={[limitRowStyles.compName, { color: theme.colors.text }]} numberOfLines={2}>
          {c.name}
        </Text>
        <Text style={[limitRowStyles.compMeta, { color: theme.colors.textMuted }]}>
          {metaParts.join(' · ')}
        </Text>
      </View>
    );
  };

  return (
    <View style={limitRowStyles.compList}>
      {counting.length > 0 ? (
        <>
          <Text style={[limitRowStyles.compSectionLabel, { color: theme.colors.textMuted }]}>
            Counts toward your limit
          </Text>
          {counting.map(renderRow)}
        </>
      ) : null}
      {other.length > 0 ? (
        <>
          <Text
            style={[
              limitRowStyles.compSectionLabel,
              { color: theme.colors.textMuted },
              counting.length > 0 ? limitRowStyles.compSectionLabelSpaced : null,
            ]}
          >
            Does not count
          </Text>
          {other.map(renderRow)}
        </>
      ) : null}
    </View>
  );
}

const limitRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  icon: { marginTop: 2 },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  detail: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  detailLoader: { paddingVertical: 12 },
  emptyDetail: { fontSize: 13, paddingVertical: 10, lineHeight: 18 },
  compList: { paddingBottom: 4 },
  compSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  compSectionLabelSpaced: { marginTop: 8 },
  compRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compName: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  compMeta: { fontSize: 12, marginTop: 2, lineHeight: 16 },
});

type PlanCardProps = {
  kindLabel: string;
  title: string;
  subtitle: string;
  accent: string;
  expanded: boolean;
  onPress: () => void;
  children: ReactNode;
  badge?: string;
};

function PlanCard({
  kindLabel,
  title,
  subtitle,
  accent,
  expanded,
  onPress,
  children,
  badge,
}: PlanCardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        cardStyles.wrap,
        {
          borderColor: expanded ? accent : theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={cardStyles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${kindLabel}, ${title}, ${subtitle}`}
      >
        <View style={[cardStyles.accentDot, { backgroundColor: accent }]} />
        <View style={cardStyles.headerText}>
          <Text style={[cardStyles.kindLabel, { color: theme.colors.textMuted }]}>{kindLabel}</Text>
          <View style={cardStyles.titleRow}>
            <Text style={[cardStyles.title, { color: theme.colors.text }]}>{title}</Text>
            {badge ? (
              <View style={[cardStyles.badge, { backgroundColor: accent + '22' }]}>
                <Text style={[cardStyles.badgeText, { color: accent }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[cardStyles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.textMuted}
        />
      </Pressable>
      {expanded ? (
        <View style={[cardStyles.body, { borderTopColor: theme.colors.border }]}>{children}</View>
      ) : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerText: { flex: 1, minWidth: 0 },
  kindLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

type Props = {
  displayName: string;
  userId: string | null;
  entitlements: SubscriptionEntitlements | null;
  loading: boolean;
  playerAccent: string;
  organiserAccent: string;
  children?: ReactNode;
};

export function AccountSubscriptionPanel({
  displayName,
  userId,
  entitlements,
  loading,
  playerAccent,
  organiserAccent,
  children,
}: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<ExpandKey>(null);
  const [detailExpanded, setDetailExpanded] = useState<DetailKey>(null);
  const [joinsList, setJoinsList] = useState<SubscriptionUsageCompetition[] | null>(null);
  const [createsList, setCreatesList] = useState<SubscriptionUsageCompetition[] | null>(null);
  const [joinsLoading, setJoinsLoading] = useState(false);
  const [createsLoading, setCreatesLoading] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { gap: 16, width: '100%' },
        profile: {
          paddingVertical: 4,
          gap: 4,
        },
        profileName: {
          fontSize: 22,
          fontWeight: '700',
          color: theme.colors.text,
        },
        profileMeta: {
          fontSize: 14,
          color: theme.colors.textMuted,
        },
        sectionLabel: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.6,
          color: theme.colors.textMuted,
          marginBottom: 8,
          marginTop: 4,
        },
        planStack: { gap: 10 },
        upgradeNote: {
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 18,
          marginTop: 4,
        },
        securitySection: {
          gap: 12,
          marginTop: 8,
        },
      }),
    [theme]
  );

  const toggle = (key: ExpandKey) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  const loadJoins = useCallback(async () => {
    if (!userId) return;
    setJoinsLoading(true);
    try {
      const list = await fetchMySubscriptionJoins(userId);
      setJoinsList(list);
    } catch {
      setJoinsList([]);
    } finally {
      setJoinsLoading(false);
    }
  }, [userId]);

  const loadCreates = useCallback(async () => {
    if (!userId) return;
    setCreatesLoading(true);
    try {
      const list = await fetchMySubscriptionCreatedCompetitions(userId);
      setCreatesList(list);
    } catch {
      setCreatesList([]);
    } finally {
      setCreatesLoading(false);
    }
  }, [userId]);

  const toggleDetail = (key: DetailKey) => {
    setDetailExpanded((prev) => {
      const next = prev === key ? null : key;
      if (next === 'joins' && joinsList === null && userId) {
        void loadJoins();
      }
      if (next === 'creates' && createsList === null && userId) {
        void loadCreates();
      }
      return next;
    });
  };

  const ent = entitlements;
  const hasOrganiser = ent
    ? ent.is_owner || ent.creator_tier || ent.lifetime_creator_tier
    : false;

  return (
    <View style={styles.root}>
      <View style={styles.profile}>
        <Text style={styles.profileName}>{displayName || 'Your account'}</Text>
        <Text style={styles.profileMeta}>Manage your plan and account security</Text>
      </View>

      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>

      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : ent ? (
        <View style={styles.planStack}>
          <PlanCard
            kindLabel="PLAYER PLAN"
            title={playerPlanTitle(ent)}
            subtitle={playerPlanSubtitle(ent)}
            accent={playerAccent}
            expanded={expanded === 'player'}
            onPress={() => toggle('player')}
            badge={ent.lifetime_participant_tier ? 'Lifetime' : undefined}
          >
            <LimitRow
              icon="enter-outline"
              label="Competition joins"
              value={`${ent.current_join_count ?? 0} / ${formatLimit(ent.max_concurrent_joins)}`}
              hint="Only alive in live competitions counts. Eliminated or completed leagues do not."
              expandable={
                (ent.current_join_count ?? 0) > 0 ||
                (ent.current_eliminated_in_live_count ?? 0) > 0
              }
              detailExpanded={detailExpanded === 'joins'}
              onToggleDetail={() => toggleDetail('joins')}
              detailLoading={joinsLoading}
              detail={<CompetitionUsageList items={joinsList ?? []} />}
            />
            <LimitRow
              icon="megaphone-outline"
              label="In-app advertising"
              value={ent.show_ads ? 'Shown' : 'None'}
              hint={
                ent.show_ads
                  ? 'Free User plan may show occasional banners in the app. Paid player plans remove ads.'
                  : 'Your plan does not show advertising.'
              }
            />
            {!ent.is_owner && effectiveParticipantTier(ent) === 'user' ? (
              <Text style={styles.upgradeNote}>
                Upgrade to User Plus or User Premium for more joins and no ads. Payments coming soon.
              </Text>
            ) : null}
          </PlanCard>

          <PlanCard
            kindLabel="ORGANISER PLAN"
            title={organiserPlanTitle(ent)}
            subtitle={organiserPlanSubtitle(ent)}
            accent={organiserAccent}
            expanded={expanded === 'organiser'}
            onPress={() => toggle('organiser')}
            badge={
              ent.lifetime_creator_tier && !ent.creator_tier ? 'Lifetime' : undefined
            }
          >
            {hasOrganiser ? (
              <>
                <LimitRow
                  icon="trophy-outline"
                  label="Active competitions"
                  value={`${ent.current_create_count ?? 0} / ${formatLimit(ent.max_concurrent_creates)}`}
                  hint="Open or running competitions you created"
                  expandable={(ent.current_create_count ?? 0) > 0}
                  detailExpanded={detailExpanded === 'creates'}
                  onToggleDetail={() => toggleDetail('creates')}
                  detailLoading={createsLoading}
                  detail={<CompetitionUsageList items={createsList ?? []} />}
                />
                <LimitRow
                  icon="people-outline"
                  label="Players per competition"
                  value={formatLimit(ent.max_participants_per_competition)}
                />
                <LimitRow
                  icon="analytics-outline"
                  label="Total players (all comps)"
                  value={`${ent.current_aggregate_participants ?? 0} / ${formatLimit(
                    ent.max_aggregate_active_participants
                  )}`}
                  hint="Across your live competitions"
                />
                <LimitRow
                  icon="football-outline"
                  label="Sports"
                  value={
                    ent.create_sport_scope === 'all'
                      ? 'Football, racing & more'
                      : 'One sport at a time'
                  }
                />
                {ent.kiosk_purchase_allowed ? (
                  <LimitRow
                    icon="tablet-outline"
                    label="Kiosk licences"
                    value={String(ent.kiosk_licenses_count ?? 0)}
                    hint="€80 per kiosk when available"
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.upgradeNote}>
                  Creator plans let you run pub and club competitions with join codes, approvals, and
                  admin tools.
                </Text>
                <LimitRow icon="create-outline" label="Create competitions" value="Not included" />
                <LimitRow icon="enter-outline" label="Player plan includes" value="User Plus benefits" />
              </>
            )}
          </PlanCard>
        </View>
      ) : (
        <Text style={styles.upgradeNote}>Could not load subscription details. Pull to refresh.</Text>
      )}

      {children ? (
        <View style={styles.securitySection}>
          <Text style={styles.sectionLabel}>SECURITY</Text>
          {children}
        </View>
      ) : null}
    </View>
  );
}

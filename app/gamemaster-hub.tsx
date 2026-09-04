import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { GamemasterWelcomeSetupModal } from '@/components/GamemasterWelcomeSetupModal';
import { GamemasterQuoteRequestForm } from '@/components/GamemasterQuoteRequestForm';
import {
  fetchMyEntitlements,
  isGamemasterAccount,
  needsGamemasterClubSetup,
  type SubscriptionEntitlements,
} from '@/lib/subscriptionEntitlements';
import { gamemasterListMyQuotes, gamemasterRequestQuote, gamemasterProvisionMyQuote, type GamemasterQuote } from '@/lib/gamemasterApi';
import { kioskListMyCompetitions, type KioskCompetitionOption } from '@/lib/kioskApi';
import { sportLabel, type KioskSport } from '@/lib/kioskSession';
import { formatEuro } from '@/lib/gamemasterCustomPricing';
import {
  DESKTOP_BREAKPOINT,
  DESKTOP_COLUMN_GAP,
  DESKTOP_FORM_MAX,
  DESKTOP_STAGE_MAX,
  desktopHorizontalPad,
  isCompactSize,
} from '@/lib/desktopLayout';

type TabKey = 'account' | 'quotes' | 'competitions';

export default function GamemasterHubScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isCompact = isCompactSize(width, height);
  const horizontalPad = desktopHorizontalPad(theme.spacing, width, height);
  const { userId, signOut, isLoading: authLoading } = useAuth();
  const styles = useMemo(
    () => makeStyles(theme, insets, isDesktop, horizontalPad),
    [theme, insets, isDesktop, horizontalPad]
  );

  const [tab, setTab] = useState<TabKey>('competitions');
  const [ent, setEnt] = useState<SubscriptionEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [comps, setComps] = useState<KioskCompetitionOption[]>([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [quotes, setQuotes] = useState<GamemasterQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [provisionBusy, setProvisionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const next = await fetchMyEntitlements();
      setEnt(next);
      if (!isGamemasterAccount(next)) {
        router.replace('/competition-hub');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadComps = useCallback(async () => {
    setCompsLoading(true);
    try {
      const list = await kioskListMyCompetitions();
      setComps(list);
    } catch {
      setComps([]);
    } finally {
      setCompsLoading(false);
    }
  }, []);

  const loadQuotes = useCallback(async () => {
    if (!userId) return;
    setQuotesLoading(true);
    try {
      const list = await gamemasterListMyQuotes();
      setQuotes(list);
    } catch {
      setQuotes([]);
    } finally {
      setQuotesLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (ent && isGamemasterAccount(ent) && ent.club_setup_complete) {
      void loadComps();
      void loadQuotes();
    }
  }, [ent?.club_setup_complete, ent, loadComps, loadQuotes]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    if (ent?.club_setup_complete !== false) await loadComps();
    if (ent?.club_setup_complete !== false) await loadQuotes();
    setRefreshing(false);
  };

  const showSetup = needsGamemasterClubSetup(ent);

  const requestQuotes = quotes.filter((q) => q.kind === 'request');
  const currentQuotes = quotes.filter((q) => q.status !== 'requested');
  const paidActiveQuote = currentQuotes.find((q) => q.status === 'paid_active');
  const awaitingPaymentQuote = currentQuotes.find((q) => q.status === 'pending_payment');

  const runProvision = async () => {
    if (!paidActiveQuote) return;
    setProvisionBusy(true);
    try {
      const res = await gamemasterProvisionMyQuote(paidActiveQuote.id);
      if (!res.success) {
        Alert.alert('Could not create competitions', res.error ?? 'Try again or ask your club owner.');
        return;
      }
      const createdCount = Array.isArray(res.created) ? res.created.length : 0;
      if (createdCount > 0) {
        Alert.alert(
          'Competitions ready',
          `Created ${createdCount} competition${createdCount === 1 ? '' : 's'}.`
        );
      } else if (res.skipped) {
        Alert.alert('Already set up', 'Your quote competitions are already on this account.');
      }
      await loadComps();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create competitions');
    } finally {
      setProvisionBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050805', '#0a120e', '#070a08']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <GamemasterWelcomeSetupModal
        visible={showSetup}
        onComplete={() => void load()}
      />

      <View style={styles.chrome}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            {ent?.club_logo_url ? (
              <Image source={{ uri: ent.club_logo_url }} style={styles.headerLogo} />
            ) : null}
            <View style={styles.headerTextCol}>
              <Text style={styles.eyebrow}>Gamemaster</Text>
              <Text style={styles.clubName} numberOfLines={1}>
                {ent?.club_name?.trim() || 'Your club'}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.tabs} accessibilityRole="tablist">
              {(
                [
                  { key: 'account', label: 'Account' },
                  { key: 'quotes', label: 'Quotes' },
                  { key: 'competitions', label: 'Competitions' },
                ] as const
              ).map((t) => {
                const active = tab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => setTab(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => void signOut().then(() => router.replace('/(auth)/login'))}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        <View style={styles.stage}>
          {tab === 'account' ? (
            <View style={[styles.card, isDesktop && styles.accountDesktop]}>
              <View style={isDesktop ? styles.accountMain : undefined}>
                <Text style={styles.cardTitle}>Club account</Text>
                <Text style={styles.cardBody}>
                  This is a club Gamemaster account. You create and manage competitions for your
                  members — you cannot join other competitions as a player.
                </Text>
                <Pressable
                  style={styles.linkBtn}
                  onPress={() => router.push('/(auth)/hub-login' as any)}
                >
                  <Text style={styles.linkBtnText}>Open Competition Hub setup</Text>
                </Pressable>
              </View>
              <View style={isDesktop ? styles.accountRail : undefined}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Club</Text>
                  <Text style={styles.metaValue}>{ent?.club_name ?? '—'}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Hub licences</Text>
                  <Text style={styles.metaValue}>{ent?.kiosk_licenses_count ?? 0}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Payment link</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {ent?.club_payment_url ?? 'Not set'}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {tab === 'quotes' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Quotes</Text>
              <Text style={styles.cardBody}>
                Requests are reviewed by your club owner. Once approved, a quote becomes the current
                package for your competitions.
              </Text>

              {quotesLoading ? (
                <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 12 }} />
              ) : null}

              <View style={styles.quotesSplit}>
                <View style={styles.quotesCol}>
                  <Text style={styles.sectionLabel}>Requests</Text>
                  {requestQuotes.filter((q) => q.status !== 'paid_complete').length === 0 ? (
                    <Text style={styles.empty}>No quote requests yet.</Text>
                  ) : (
                    requestQuotes.map((q) => (
                      <View key={q.id} style={styles.quoteRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quoteTitle}>
                            {q.status === 'requested' ? 'Requested' : q.status.replaceAll('_', ' ')}
                          </Text>
                          <Text style={styles.quoteMeta}>
                            {q.payload.competitions.length} competitions · {q.payload.competitionHubs}{' '}
                            hub{q.payload.competitionHubs === 1 ? '' : 's'}
                          </Text>
                          {q.notes ? <Text style={styles.quoteMeta}>{q.notes}</Text> : null}
                        </View>
                        <Text style={styles.quoteAmount}>
                          {q.due_today != null ? formatEuro(q.due_today) : '—'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.quotesCol}>
                  <Text style={styles.sectionLabel}>Current</Text>
                  {currentQuotes.length === 0 ? (
                    <Text style={styles.empty}>No current quote issued yet.</Text>
                  ) : (
                    currentQuotes.map((q) => (
                      <View key={q.id} style={styles.quoteRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quoteTitle}>
                            {q.kind === 'onboarding' ? 'Onboarding' : 'Request'} ·{' '}
                            {q.status.replaceAll('_', ' ')}
                          </Text>
                          <Text style={styles.quoteMeta}>
                            {q.payload.competitions.length} competitions · {q.payload.competitionHubs}{' '}
                            hub{q.payload.competitionHubs === 1 ? '' : 's'}
                          </Text>
                          {q.notes ? <Text style={styles.quoteMeta}>{q.notes}</Text> : null}
                        </View>
                        <Text style={styles.quoteAmount}>
                          {q.due_today != null ? formatEuro(q.due_today) : '—'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>

              <View style={styles.requestFormWrap}>
                <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Request another quote</Text>
                <GamemasterQuoteRequestForm
                  accent={theme.colors.accent}
                  onRequestQuote={async (payload) => {
                    const res = await gamemasterRequestQuote(payload);
                    if (!res.success) {
                      throw new Error(res.error ?? 'Could not send quote request');
                    }
                    await loadQuotes();
                  }}
                />
              </View>
            </View>
          ) : null}

          {tab === 'competitions' ? (
            <View style={[styles.card, isDesktop && !isCompact ? styles.compsDesktop : null]}>
              <Text style={styles.cardTitle}>Your competitions</Text>
              <Text style={styles.cardBody}>
                {comps.length > 0
                  ? 'Open a competition to manage join codes, requests, and game settings.'
                  : paidActiveQuote
                    ? 'Your package is paid. Create the quoted competitions below if they are not listed yet.'
                    : awaitingPaymentQuote
                      ? 'Competitions unlock after your club owner confirms payment on your quote.'
                      : 'Competitions unlock after your quote is issued and payment is confirmed.'}
              </Text>
              {compsLoading ? (
                <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 12 }} />
              ) : comps.length === 0 ? (
                <View style={{ gap: 12 }}>
                  <Text style={styles.empty}>No competitions yet.</Text>
                  {paidActiveQuote ? (
                    <Pressable
                      style={[styles.linkBtn, provisionBusy && { opacity: 0.6 }]}
                      disabled={provisionBusy}
                      onPress={() => void runProvision()}
                    >
                      {provisionBusy ? (
                        <ActivityIndicator color={theme.colors.accent} />
                      ) : (
                        <Text style={styles.linkBtnText}>Create competitions from quote</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.compsGrid}>
                  {comps.map((c) => (
                    <Pressable
                      key={`${c.sport}-${c.id}`}
                      style={styles.compRow}
                      onPress={() => {
                        if (c.sport === 'lms') router.push(`/(lms)/${c.id}` as any);
                        else if (c.sport === 'f2t') router.push(`/(f2t)/${c.id}` as any);
                        else router.push(`/(app)/competition/${c.id}` as any);
                      }}
                    >
                      <Text style={styles.compName}>{c.name}</Text>
                      <Text style={styles.compMeta}>
                        {sportLabel(c.sport as KioskSport)} · {c.status}
                        {c.join_code ? ` · ${c.join_code}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(
  theme: ReturnType<typeof useTheme>,
  insets: { top: number; bottom: number },
  isDesktop: boolean,
  horizontalPad: number
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    chrome: {
      paddingTop: insets.top + 8,
      paddingHorizontal: horizontalPad,
      paddingBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      zIndex: 2,
    },
    header: {
      width: '100%',
      maxWidth: DESKTOP_STAGE_MAX,
      alignSelf: 'center',
      flexDirection: isDesktop ? 'row' : 'column',
      alignItems: isDesktop ? 'center' : 'stretch',
      justifyContent: 'space-between',
      gap: isDesktop ? 16 : 10,
      paddingBottom: 8,
    },
    headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
    headerLogo: {
      width: isDesktop ? 48 : 44,
      height: isDesktop ? 48 : 44,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
    },
    headerTextCol: { flex: 1, minWidth: 0 },
    eyebrow: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    clubName: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: isDesktop ? 24 : 22,
      color: theme.colors.text,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: isDesktop ? 'flex-end' : 'space-between',
      gap: isDesktop ? 20 : 12,
      flexWrap: 'wrap',
    },
    signOut: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    tabs: {
      flexDirection: 'row',
      gap: isDesktop ? 18 : 8,
      alignItems: 'center',
    },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: isDesktop ? 4 : 14,
      borderRadius: isDesktop ? 0 : theme.radius.sm,
      borderWidth: isDesktop ? 0 : StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderBottomWidth: isDesktop ? 2 : StyleSheet.hairlineWidth,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderColor: theme.colors.accent,
      borderBottomColor: theme.colors.accent,
      backgroundColor: isDesktop ? 'transparent' : theme.colors.accentMuted,
    },
    tabText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    tabTextActive: { color: theme.colors.accent },
    body: {
      paddingHorizontal: horizontalPad,
      paddingTop: isDesktop ? theme.spacing.lg : theme.spacing.md,
      paddingBottom: insets.bottom + theme.spacing.xl,
      flexGrow: 1,
    },
    stage: {
      width: '100%',
      maxWidth: DESKTOP_STAGE_MAX,
      alignSelf: 'center',
      gap: theme.spacing.md,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: isDesktop ? theme.spacing.lg : theme.spacing.md,
      gap: 10,
    },
    accountDesktop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: DESKTOP_COLUMN_GAP + 8,
    },
    accountMain: {
      flex: 1.4,
      minWidth: 0,
      gap: 10,
    },
    accountRail: {
      flex: 1,
      minWidth: 240,
      maxWidth: 360,
      gap: 4,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    cardTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: isDesktop ? 22 : 20,
      color: theme.colors.text,
    },
    cardBody: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },
    sectionLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      letterSpacing: 0.4,
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      marginTop: 10,
      marginBottom: 4,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    metaLabel: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    metaValue: {
      flex: 1,
      textAlign: 'right',
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      color: theme.colors.text,
    },
    linkBtn: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accent,
    },
    linkBtnText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.accent,
    },
    quotesSplit: {
      flexDirection: isDesktop ? 'row' : 'column',
      gap: DESKTOP_COLUMN_GAP,
      marginTop: 4,
    },
    quotesCol: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    requestFormWrap: {
      width: '100%',
      maxWidth: isDesktop ? DESKTOP_FORM_MAX : '100%',
      alignSelf: 'flex-start',
    },
    quoteRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    quoteTitle: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.text,
    },
    quoteMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    quoteAmount: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 14,
      color: theme.colors.accent,
    },
    compsDesktop: {},
    compsGrid: {
      flexDirection: isDesktop ? 'row' : 'column',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 4,
    },
    compRow: {
      width: isDesktop ? '48.5%' : '100%',
      maxWidth: isDesktop ? '48.5%' : '100%',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      gap: 4,
    },
    compName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    compMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    empty: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
  });
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { isDesktopWebForOwnerTools } from '@/lib/clubLogoStorage';
import { ownerRegisterGamemaster, type OwnerUserRow } from '@/lib/ownerApi';
import {
  ASSUMED_SEASON_WEEKS,
  calculateLeagueBill,
  createEmptyCompetition,
  FOOTBALL_MODE_OPTIONS,
  formatEuro,
  LEAGUE_BILL_LIMITS,
  LEAGUE_BILL_RATES,
  LMS_CONTINUATION_OPTIONS,
  TIPSTER20_CONTINUATION_OPTIONS,
  type ClubFootballMode,
  type CompetitionDraft,
  type LeagueBillInput,
  type LeagueBillQuote,
  type LmsContinuationMode,
  type Tipster20ContinuationMode,
} from '@/lib/gamemasterCustomPricing';

// ─── Stepper row ────────────────────────────────────────────────────────────

type StepperProps = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  disabled?: boolean;
};

function StepperRow({ label, hint, value, min, max, step, onChange, disabled }: StepperProps) {
  const theme = useTheme();
  const canDec = value - step >= min && !disabled;
  const canInc = value + step <= max && !disabled;
  return (
    <View style={sRow.wrap}>
      <View style={sRow.labelBlock}>
        <Text style={[sRow.label, { color: theme.colors.text }]}>{label}</Text>
        {hint ? <Text style={[sRow.hint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
      </View>
      <View style={sRow.controls}>
        <Pressable
          onPress={() => canDec && onChange(value - step)}
          disabled={!canDec}
          style={[sRow.btn, { borderColor: theme.colors.border, opacity: canDec ? 1 : 0.35 }]}
        >
          <Ionicons name="remove" size={18} color={theme.colors.text} />
        </Pressable>
        <Text style={[sRow.value, { color: theme.colors.text }]}>{value}</Text>
        <Pressable
          onPress={() => canInc && onChange(value + step)}
          disabled={!canInc}
          style={[sRow.btn, { borderColor: theme.colors.border, opacity: canInc ? 1 : 0.35 }]}
        >
          <Ionicons name="add" size={18} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}
const sRow = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  labelBlock: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 44, textAlign: 'center', fontSize: 16, fontWeight: '700' },
});

// ─── Props ──────────────────────────────────────────────────────────────────

type Props = {
  users: OwnerUserRow[];
  usersLoading?: boolean;
  accent?: string;
  onRegistered?: () => void;
};

type Step = 'select_user' | 'build_quote';

export function OwnerGamemasterPromoteFlow({ users, usersLoading, accent, onRegistered }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const accentColor = accent ?? theme.colors.accent;
  const styles = useMemo(() => makeStyles(theme, accentColor), [theme, accentColor]);
  const desktopOk = isDesktopWebForOwnerTools(width);

  const [step, setStep] = useState<Step>('select_user');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');

  // Quote builder state
  const [input, setInput] = useState<LeagueBillInput>({
    competitions: [],
    competitionHubs: 0,
    includeFestivalPass: false,
  });
  const [draft, setDraft] = useState<CompetitionDraft | null>(null);
  const [customDiscount, setCustomDiscount] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const quote = useMemo(() => calculateLeagueBill(input), [input]);

  const discountAmount = useMemo(() => {
    const v = parseFloat(customDiscount);
    return isNaN(v) || v <= 0 ? 0 : Math.min(v, quote.dueToday);
  }, [customDiscount, quote.dueToday]);

  const finalDueToday = Math.max(0, quote.dueToday - discountAmount);

  const canAddMore = input.competitions.length < LEAGUE_BILL_LIMITS.maxCompetitions;

  const candidates = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter((u) => u.role !== 'Owner')
      .filter(
        (u) =>
          (u.username ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [users, userQuery]);

  const searchActive = userQuery.trim().length > 0;

  const selected = users.find((u) => u.id === selectedUserId) ?? null;

  if (!desktopOk) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Desktop only</Text>
        <Text style={styles.hint}>
          Promoting a user to Gamemaster is only available on a laptop or desktop browser.
        </Text>
      </View>
    );
  }

  // ── Handlers ──

  const goToQuote = () => {
    if (!selectedUserId) {
      setError('Select a registered user first.');
      return;
    }
    setError(null);
    setStep('build_quote');
  };

  const goBackToUser = () => {
    setError(null);
    setStep('select_user');
  };

  const startAddCompetition = () => {
    if (!canAddMore || draft) return;
    setDraft(createEmptyCompetition());
  };

  const saveDraft = () => {
    if (!draft) return;
    setInput((prev) => ({
      ...prev,
      competitions: [...prev.competitions, draft].slice(0, LEAGUE_BILL_LIMITS.maxCompetitions),
    }));
    setDraft(null);
  };

  const removeCompetition = (id: string) => {
    setInput((prev) => ({
      ...prev,
      competitions: prev.competitions.filter((c) => c.id !== id),
    }));
  };

  const patchDraft = (partial: Partial<CompetitionDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const renderChoice = <T extends string>(
    options: { key: T; label: string; hint: string }[],
    selectedKey: T,
    onSelect: (key: T) => void
  ) =>
    options.map((opt) => {
      const active = selectedKey === opt.key;
      return (
        <Pressable
          key={opt.key}
          onPress={() => onSelect(opt.key)}
          style={[
            styles.optionRow,
            {
              borderColor: active ? accentColor : theme.colors.border,
              backgroundColor: active ? accentColor + '14' : theme.colors.surfaceElevated,
            },
          ]}
        >
          <Ionicons
            name={active ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={active ? accentColor : theme.colors.textMuted}
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{opt.label}</Text>
            <Text style={[styles.optionHint, { color: theme.colors.textMuted }]}>{opt.hint}</Text>
          </View>
        </Pressable>
      );
    });

  const onSubmit = async () => {
    if (!selectedUserId) return;
    if (input.competitions.length < 1) {
      setError('Add at least 1 competition to the onboarding quote.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await ownerRegisterGamemaster({
        userId: selectedUserId,
        kioskLicenses: Math.max(1, input.competitionHubs),
        quote: {
          payload: input,
          season_total: quote.seasonTotal,
          hub_deposit_total: quote.hubDepositTotal,
          hub_monthly_total: quote.hubMonthlyTotal,
          due_today: finalDueToday,
          assumed_season_weeks: quote.assumedSeasonWeeks,
        },
      });
      if (!res.success) {
        setError(
          res.error === 'cannot_convert_owner'
            ? 'Cannot convert an Owner account.'
            : res.error === 'quote_required'
              ? 'Add at least 1 competition to the quote.'
              : res.error ?? 'Could not promote user'
        );
        return;
      }
      const name = selected?.username?.trim() || selected?.email || 'User';
      setSuccessMessage(
        `${name} has been promoted to Gamemaster and their quote has been sent. Once accepted and payment has been received you can allow this account to start creating their competition(s) within the Manage section.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not promote user');
    } finally {
      setBusy(false);
    }
  };

  const onCloseSuccess = () => {
    setSuccessMessage(null);
    setStep('select_user');
    setSelectedUserId(null);
    setUserQuery('');
    setInput({ competitions: [], competitionHubs: 0, includeFestivalPass: false });
    setDraft(null);
    setCustomDiscount('');
    onRegistered?.();
  };

  // ── Step 1: Select user ──

  if (step === 'select_user') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Promote to Gamemaster</Text>
        <Text style={styles.hint}>
          Select a registered user to promote to a club Gamemaster account.
        </Text>

        <Text style={styles.label}>FIND USER</Text>
        <TextInput
          style={styles.input}
          value={userQuery}
          onChangeText={(text) => {
            setUserQuery(text);
            if (!text.trim()) setSelectedUserId(null);
          }}
          placeholder="Search username or email"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />

        {searchActive ? (
          usersLoading ? (
            <ActivityIndicator color={accentColor} style={{ marginVertical: 8 }} />
          ) : (
            <ScrollView style={styles.userList} contentContainerStyle={styles.userListContent} nestedScrollEnabled>
              {candidates.map((u) => {
                const active = u.id === selectedUserId;
                return (
                  <Pressable
                    key={u.id}
                    style={[styles.userRow, active && styles.userRowActive]}
                    onPress={() => setSelectedUserId(u.id)}
                  >
                    <Text style={styles.userName} numberOfLines={1}>
                      {u.username?.trim() || 'User'}
                    </Text>
                    <Text style={styles.userMeta} numberOfLines={1}>
                      {u.role}
                      {u.email ? ` · ${u.email}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
              {candidates.length === 0 ? (
                <Text style={styles.hint}>No matching users.</Text>
              ) : null}
            </ScrollView>
          )
        ) : (
          <Text style={styles.hint}>Start typing a username or email to find a user.</Text>
        )}

        {selected ? (
          <View style={styles.selectedBanner}>
            <Ionicons name="person-circle-outline" size={20} color={accentColor} />
            <Text style={[styles.selectedName, { color: accentColor }]}>
              {selected.username?.trim() || selected.email || 'User'}
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryBtn, !selectedUserId && styles.disabled]}
          disabled={!selectedUserId}
          onPress={goToQuote}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  // ── Step 2: Build onboarding quote ──

  return (
    <View style={styles.card}>
      <Pressable onPress={goBackToUser} style={styles.backRow}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.textMuted} />
        <Text style={styles.backText}>Back to user selection</Text>
      </Pressable>

      <Text style={styles.title}>Onboarding Quote</Text>
      <Text style={styles.hint}>
        Build the package for{' '}
        <Text style={{ fontWeight: '700', color: accentColor }}>
          {selected?.username?.trim() || selected?.email || 'selected user'}
        </Text>
        . Add competitions, hubs, and optional extras. You can apply a custom discount at the end.
      </Text>

      {/* ── Competitions ── */}
      <Text style={styles.sectionLabel}>COMPETITIONS</Text>
      {input.competitions.length === 0 && !draft ? (
        <Text style={styles.emptyHint}>No competitions on this quote yet.</Text>
      ) : null}

      {input.competitions.map((c, index) => {
        const summary = quote.competitionSummaries[index];
        const modeLabel =
          FOOTBALL_MODE_OPTIONS.find((m) => m.key === c.footballMode)?.label ?? c.footballMode;
        return (
          <View key={c.id} style={styles.listedComp}>
            <View style={styles.listedHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listedTitle, { color: theme.colors.text }]}>
                  {modeLabel} · cap {c.maxPlayers}
                </Text>
                <Text style={[styles.listedMeta, { color: theme.colors.textMuted }]}>
                  {summary?.continuationLabel ?? '—'} ·{' '}
                  {summary
                    ? `${summary.planningPlayers} @ ${formatEuro(summary.platformRate)}/player`
                    : '—'}
                </Text>
              </View>
              <Text style={[styles.listedAmount, { color: theme.colors.text }]}>
                {summary ? formatEuro(summary.amount) : '—'}
              </Text>
              <Pressable onPress={() => removeCompetition(c.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            {summary?.breakdown.map((row) => (
              <View key={`${c.id}_${row.label}`} style={styles.breakRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.breakLabel, { color: theme.colors.textSecondary }]}>
                    {row.label}
                  </Text>
                  {row.detail ? (
                    <Text style={[styles.breakDetail, { color: theme.colors.textMuted }]}>
                      {row.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.breakAmount, { color: theme.colors.text }]}>
                  {formatEuro(row.amount)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}

      {/* ── Draft competition ── */}
      {draft ? (
        <View style={[styles.draftCard, { borderColor: accentColor }]}>
          <Text style={[styles.draftTitle, { color: theme.colors.text }]}>Add a competition</Text>

          <Text style={styles.sectionLabel}>GAME MODE</Text>
          {renderChoice(FOOTBALL_MODE_OPTIONS, draft.footballMode, (fm) =>
            patchDraft({ footballMode: fm as ClubFootballMode })
          )}

          <StepperRow
            label="Player cap"
            hint={`75% = ${Math.round(draft.maxPlayers * 0.75)} planning players`}
            value={draft.maxPlayers}
            min={LEAGUE_BILL_LIMITS.maxPlayers.min}
            max={LEAGUE_BILL_LIMITS.maxPlayers.max}
            step={LEAGUE_BILL_LIMITS.maxPlayers.step}
            onChange={(maxPlayers) => patchDraft({ maxPlayers })}
          />

          <Text style={styles.sectionLabel}>
            {draft.footballMode === 'tipster20' ? 'TIPSTER20 OUTCOME' : 'CONTINUATION'}
          </Text>
          {draft.footballMode === 'lms'
            ? renderChoice(LMS_CONTINUATION_OPTIONS, draft.lmsContinuation, (v) =>
                patchDraft({ lmsContinuation: v as LmsContinuationMode })
              )
            : renderChoice(TIPSTER20_CONTINUATION_OPTIONS, draft.tipster20Continuation, (v) =>
                patchDraft({ tipster20Continuation: v as Tipster20ContinuationMode })
              )}

          <View style={styles.draftActions}>
            <Pressable
              onPress={() => setDraft(null)}
              style={[styles.secondaryBtn, { backgroundColor: theme.colors.border }]}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={saveDraft}
              style={[styles.secondaryBtn, { backgroundColor: accentColor }]}
            >
              <Text style={[styles.secondaryBtnText, { color: '#fff' }]}>Add to quote</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={startAddCompetition}
          disabled={!canAddMore}
          style={[
            styles.addBtn,
            { borderColor: canAddMore ? accentColor : theme.colors.border, opacity: canAddMore ? 1 : 0.45 },
          ]}
        >
          <Ionicons name="add-circle-outline" size={22} color={canAddMore ? accentColor : theme.colors.textMuted} />
          <Text style={[styles.addBtnText, { color: canAddMore ? accentColor : theme.colors.textMuted }]}>
            Add a competition
          </Text>
        </Pressable>
      )}

      {/* ── Additionals ── */}
      <Text style={styles.sectionLabel}>ADDITIONALS</Text>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Festival pass</Text>
          <Text style={styles.toggleHint}>
            One named meeting · {formatEuro(LEAGUE_BILL_RATES.festivalPass)}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            setInput((prev) => ({ ...prev, includeFestivalPass: !prev.includeFestivalPass }))
          }
          style={[
            styles.toggleChip,
            input.includeFestivalPass && { backgroundColor: accentColor + '20', borderColor: accentColor },
          ]}
        >
          <Text
            style={[
              styles.toggleChipText,
              input.includeFestivalPass && { color: accentColor },
            ]}
          >
            {input.includeFestivalPass ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>

      <StepperRow
        label="Competition hubs"
        hint={`€${LEAGUE_BILL_RATES.hubDeposit} deposit + €${LEAGUE_BILL_RATES.hubMonthly}/mo`}
        value={input.competitionHubs}
        min={LEAGUE_BILL_LIMITS.competitionHubs.min}
        max={LEAGUE_BILL_LIMITS.competitionHubs.max}
        step={1}
        onChange={(competitionHubs) => setInput((prev) => ({ ...prev, competitionHubs }))}
      />

      {/* ── Totals ── */}
      {input.competitions.length > 0 ? (
        <View style={styles.totalsCard}>
          {quote.lines.map((line) => (
            <View key={line.label} style={styles.totalLineRow}>
              <Text style={[styles.totalLineLabel, { color: theme.colors.textSecondary }]}>
                {line.label}
              </Text>
              <Text style={[styles.totalLineAmount, { color: theme.colors.text }]}>
                {formatEuro(line.amount)}
              </Text>
            </View>
          ))}
          <View style={styles.totalLineRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.text }]}>League Bill</Text>
            <Text style={[styles.totalValue, { color: accentColor }]}>
              {formatEuro(quote.seasonTotal)}
            </Text>
          </View>

          {quote.dueTodayLines.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>COMPETITION HUBS</Text>
              {quote.dueTodayLines.map((line) => (
                <View key={line.label} style={styles.totalLineRow}>
                  <Text style={[styles.totalLineLabel, { color: theme.colors.textSecondary }]}>
                    {line.label}
                  </Text>
                  <Text style={[styles.totalLineAmount, { color: theme.colors.text }]}>
                    {formatEuro(line.amount)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.totalLineRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.text }]}>Due today</Text>
            <Text style={[styles.totalValue, { color: accentColor, fontSize: 22 }]}>
              {formatEuro(quote.dueToday)}
            </Text>
          </View>

          {/* Custom discount */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>CUSTOM DISCOUNT (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            value={customDiscount}
            onChangeText={(t) => setCustomDiscount(t.replace(/[^0-9.]/g, ''))}
            placeholder="€0.00"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            editable={!busy}
          />
          {discountAmount > 0 ? (
            <>
              <View style={styles.totalLineRow}>
                <Text style={[styles.totalLineLabel, { color: theme.colors.textSecondary }]}>
                  Discount applied
                </Text>
                <Text style={[styles.totalLineAmount, { color: theme.colors.error }]}>
                  −{formatEuro(discountAmount)}
                </Text>
              </View>
              <View style={styles.totalLineRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.text }]}>Final due today</Text>
                <Text style={[styles.totalValue, { color: accentColor, fontSize: 22 }]}>
                  {formatEuro(finalDueToday)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, (busy || input.competitions.length < 1) && styles.disabled]}
        disabled={busy || input.competitions.length < 1}
        onPress={() => void onSubmit()}
      >
        {busy ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Submit</Text>
        )}
      </Pressable>

      {/* Success modal */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={48} color={accentColor} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Promoted!</Text>
            <Text style={[styles.modalBody, { color: theme.colors.textSecondary }]}>
              {successMessage}
            </Text>
            <Pressable style={[styles.primaryBtn, { marginTop: 16 }]} onPress={onCloseSuccess}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(theme: ReturnType<typeof useTheme>, accent: string) {
  return StyleSheet.create({
    card: {
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      gap: 8,
    },
    title: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 20,
      color: theme.colors.text,
    },
    hint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textMuted,
    },
    label: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginTop: 10,
    },
    sectionLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginTop: 12,
      marginBottom: 4,
    },
    input: {
      backgroundColor: theme.colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: Platform.OS === 'web' ? 12 : 11,
      fontFamily: theme.fontFamily.input,
      fontSize: 16,
      color: theme.colors.text,
    },
    userList: { maxHeight: 280 },
    userListContent: { gap: 6, paddingBottom: 4 },
    userRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    userRowActive: {
      borderColor: accent,
      backgroundColor: theme.colors.accentMuted,
    },
    userName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    userMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    selectedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: accent,
      backgroundColor: accent + '12',
    },
    selectedName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingBottom: 6,
    },
    backText: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    emptyHint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    listedComp: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      marginBottom: 8,
      gap: 6,
    },
    listedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    listedTitle: { fontSize: 14, fontWeight: '700' },
    listedMeta: { fontSize: 12, lineHeight: 16, marginTop: 2 },
    listedAmount: { fontSize: 14, fontWeight: '700' },
    breakRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingTop: 4 },
    breakLabel: { flex: 1, fontSize: 12, lineHeight: 16 },
    breakDetail: { fontSize: 11, lineHeight: 15, marginTop: 1 },
    breakAmount: { fontSize: 12, fontWeight: '600' },
    draftCard: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: theme.colors.surfaceElevated,
      gap: 2,
    },
    draftTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
    draftActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    secondaryBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '700' },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      marginTop: 4,
    },
    addBtnText: { fontSize: 15, fontWeight: '700' },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 6,
    },
    optionTitle: { fontSize: 14, fontWeight: '600' },
    optionHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      gap: 12,
    },
    toggleLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.text,
    },
    toggleHint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    toggleChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: theme.radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    toggleChipText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    totalsCard: {
      marginTop: 8,
      padding: 14,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      gap: 4,
    },
    totalLineRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 4,
    },
    totalLineLabel: { flex: 1, fontSize: 13 },
    totalLineAmount: { fontSize: 13, fontWeight: '600' },
    totalLabel: { fontSize: 15, fontWeight: '700' },
    totalValue: { fontSize: 18, fontWeight: '800' },
    divider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      marginVertical: 10,
    },
    primaryBtn: {
      marginTop: 10,
      backgroundColor: accent,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 16,
      color: theme.colors.white,
    },
    disabled: { opacity: 0.55 },
    error: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.error,
      marginTop: 4,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      maxWidth: 440,
      width: '100%',
      alignItems: 'center',
      gap: 12,
    },
    modalTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 22,
      textAlign: 'center',
    },
    modalBody: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
  });
}

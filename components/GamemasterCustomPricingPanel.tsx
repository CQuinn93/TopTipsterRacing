import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ASSUMED_SEASON_WEEKS,
  calculateLeagueBill,
  createEmptyCompetition,
  FOOTBALL_MODE_OPTIONS,
  formatEuro,
  LEAGUE_BILL_LIMITS,
  LEAGUE_BILL_RATES,
  LMS_CONTINUATION_OPTIONS,
  platformRateForCap,
  planningPlayersForCap,
  TIPSTER20_CONTINUATION_OPTIONS,
  type ClubFootballMode,
  type CompetitionDraft,
  type LeagueBillInput,
  type LeagueBillQuote,
  type LmsContinuationMode,
  type Tipster20ContinuationMode,
} from '@/lib/gamemasterCustomPricing';

type StepperProps = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
};

function StepperRow({ label, hint, value, min, max, step, onChange }: StepperProps) {
  const theme = useTheme();
  const canDec = value - step >= min;
  const canInc = value + step <= max;

  return (
    <View style={stepperStyles.wrap}>
      <View style={stepperStyles.labelBlock}>
        <Text style={[stepperStyles.label, { color: theme.colors.text }]}>{label}</Text>
        {hint ? (
          <Text style={[stepperStyles.hint, { color: theme.colors.textMuted }]}>{hint}</Text>
        ) : null}
      </View>
      <View style={stepperStyles.controls}>
        <Pressable
          onPress={() => canDec && onChange(value - step)}
          disabled={!canDec}
          style={[
            stepperStyles.btn,
            { borderColor: theme.colors.border, opacity: canDec ? 1 : 0.35 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={18} color={theme.colors.text} />
        </Pressable>
        <Text style={[stepperStyles.value, { color: theme.colors.text }]}>{value}</Text>
        <Pressable
          onPress={() => canInc && onChange(value + step)}
          disabled={!canInc}
          style={[
            stepperStyles.btn,
            { borderColor: theme.colors.border, opacity: canInc ? 1 : 0.35 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={18} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  labelBlock: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
});

type Props = {
  accent: string;
  /**
   * Called whenever the built quote changes. Useful for “attach quote” flows.
   * Note: only valid once the user has added at least 1 competition.
   */
  onQuoteChange?: (quote: LeagueBillQuote, input: LeagueBillInput) => void;
};

export function GamemasterCustomPricingPanel({ accent, onQuoteChange }: Props) {
  const theme = useTheme();
  const [input, setInput] = useState<LeagueBillInput>({
    competitions: [],
    competitionHubs: 0,
    includeFestivalPass: false,
  });
  const [draft, setDraft] = useState<CompetitionDraft | null>(null);

  const quote = useMemo(() => calculateLeagueBill(input), [input]);
  useEffect(() => {
    onQuoteChange?.(quote, input);
  }, [onQuoteChange, quote, input]);
  const canAddMore = input.competitions.length < LEAGUE_BILL_LIMITS.maxCompetitions;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginTop: 8,
          padding: 14,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          gap: 4,
        },
        intro: {
          fontSize: 13,
          lineHeight: 19,
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        sectionLabel: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
          color: theme.colors.textMuted,
          marginTop: 10,
          marginBottom: 6,
        },
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
        },
        addBtnText: { fontSize: 15, fontWeight: '700' },
        draftCard: {
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          gap: 2,
        },
        draftTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
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
        optionBody: { flex: 1, minWidth: 0 },
        optionTitle: { fontSize: 14, fontWeight: '600' },
        optionHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
        draftActions: {
          flexDirection: 'row',
          gap: 8,
          marginTop: 10,
        },
        actionBtn: {
          flex: 1,
          paddingVertical: 11,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionBtnText: { fontSize: 14, fontWeight: '700' },
        listedComp: {
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          marginBottom: 8,
          gap: 6,
        },
        listedHeader: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
        },
        listedTitle: { fontSize: 14, fontWeight: '700' },
        listedMeta: { fontSize: 12, lineHeight: 16, marginTop: 2 },
        listedAmount: { fontSize: 14, fontWeight: '700' },
        breakRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 10,
          paddingTop: 4,
        },
        breakLabel: { flex: 1, fontSize: 12, lineHeight: 16 },
        breakDetail: { fontSize: 11, lineHeight: 15, marginTop: 1 },
        breakAmount: { fontSize: 12, fontWeight: '600' },
        rateTable: {
          marginBottom: 8,
          padding: 10,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          gap: 3,
        },
        rateTableTitle: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
        rateTableLine: { fontSize: 12, lineHeight: 17 },
        divider: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          marginVertical: 10,
        },
        totalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 4,
        },
        totalLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
        totalValue: { fontSize: 22, fontWeight: '800', color: accent },
        deposit: {
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginTop: 4,
          lineHeight: 18,
        },
        lineRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 12,
          paddingVertical: 4,
        },
        lineLabel: { flex: 1, fontSize: 13, color: theme.colors.textSecondary },
        lineAmount: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
        toggleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          gap: 12,
        },
        toggleLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
        toggleHint: {
          fontSize: 12,
          lineHeight: 16,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        capsTitle: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.4,
          color: theme.colors.textMuted,
          marginTop: 8,
          marginBottom: 4,
        },
        capText: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
        rateNote: {
          fontSize: 12,
          lineHeight: 17,
          color: theme.colors.textMuted,
          marginTop: 8,
        },
        emptyHint: {
          fontSize: 13,
          lineHeight: 18,
          color: theme.colors.textMuted,
          marginBottom: 6,
        },
      }),
    [theme, accent]
  );

  const renderChoice = <T extends string>(
    options: { key: T; label: string; hint: string }[],
    selected: T,
    onSelect: (key: T) => void
  ) =>
    options.map((opt) => {
      const active = selected === opt.key;
      return (
        <Pressable
          key={opt.key}
          onPress={() => onSelect(opt.key)}
          style={[
            styles.optionRow,
            {
              borderColor: active ? accent : theme.colors.border,
              backgroundColor: active ? accent + '14' : theme.colors.surfaceElevated,
            },
          ]}
          accessibilityRole="radio"
          accessibilityState={{ selected: active }}
        >
          <Ionicons
            name={active ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={active ? accent : theme.colors.textMuted}
            style={{ marginTop: 1 }}
          />
          <View style={styles.optionBody}>
            <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{opt.label}</Text>
            <Text style={[styles.optionHint, { color: theme.colors.textMuted }]}>{opt.hint}</Text>
          </View>
        </Pressable>
      );
    });

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

  return (
    <View style={styles.card}>
      <Text style={styles.intro}>
        Build a club package: add each competition, then optional hubs and festival pass. Fees are
        built from 75% of the player cap × platform rate, plus ads-off, optional continuation, and
        a small cushion. Season length assumed {ASSUMED_SEASON_WEEKS} weeks.
      </Text>

      <View
        style={[
          styles.rateTable,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
        ]}
      >
        <Text style={[styles.rateTableTitle, { color: theme.colors.text }]}>
          Platform rate (at 75% of cap)
        </Text>
        <Text style={[styles.rateTableLine, { color: theme.colors.textMuted }]}>
          Starts at {formatEuro(LEAGUE_BILL_RATES.platformPerPlayerStart)}/player (50-cap). −€0.01
          for every +50 on the max, floor {formatEuro(LEAGUE_BILL_RATES.platformPerPlayerFloor)}.
        </Text>
        <Text style={[styles.rateTableLine, { color: theme.colors.textMuted }]}>
          + {formatEuro(LEAGUE_BILL_RATES.adsOffPerPlayer)}/player ads removed · cushion to next €5
        </Text>
        {([50, 100, 150, 200, 250] as const).map((cap) => (
          <Text key={cap} style={[styles.rateTableLine, { color: theme.colors.textSecondary }]}>
            Cap {cap} → {formatEuro(platformRateForCap(cap))}/player · bill on{' '}
            {planningPlayersForCap(cap)} players
          </Text>
        ))}
      </View>

      <Text style={styles.sectionLabel}>COMPETITIONS</Text>
      {input.competitions.length === 0 && !draft ? (
        <Text style={styles.emptyHint}>No competitions on this quote yet.</Text>
      ) : null}

      {input.competitions.map((c, index) => {
        const summary = quote.competitionSummaries[index];
        const modeLabel =
          FOOTBALL_MODE_OPTIONS.find((m) => m.key === c.footballMode)?.label ?? c.footballMode;
        return (
          <View
            key={c.id}
            style={[
              styles.listedComp,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
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
              <Pressable
                onPress={() => removeCompetition(c.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove competition"
              >
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

      {draft ? (
        <View
          style={[
            styles.draftCard,
            { borderColor: accent, backgroundColor: theme.colors.surfaceElevated },
          ]}
        >
          <Text style={[styles.draftTitle, { color: theme.colors.text }]}>Add a competition</Text>

          <Text style={styles.sectionLabel}>GAME MODE</Text>
          {renderChoice(FOOTBALL_MODE_OPTIONS, draft.footballMode, (footballMode) =>
            patchDraft({ footballMode: footballMode as ClubFootballMode })
          )}

          <StepperRow
            label="Player cap"
            hint={`75% = ${planningPlayersForCap(draft.maxPlayers)} × ${formatEuro(platformRateForCap(draft.maxPlayers))}/player platform rate`}
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
            ? renderChoice(LMS_CONTINUATION_OPTIONS, draft.lmsContinuation, (lmsContinuation) =>
                patchDraft({ lmsContinuation: lmsContinuation as LmsContinuationMode })
              )
            : renderChoice(
                TIPSTER20_CONTINUATION_OPTIONS,
                draft.tipster20Continuation,
                (tipster20Continuation) =>
                  patchDraft({
                    tipster20Continuation: tipster20Continuation as Tipster20ContinuationMode,
                  })
              )}

          <View style={styles.draftActions}>
            <Pressable
              onPress={() => setDraft(null)}
              style={[styles.actionBtn, { backgroundColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={saveDraft}
              style={[styles.actionBtn, { backgroundColor: accent }]}
              accessibilityRole="button"
              accessibilityLabel="Save competition"
            >
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Add to quote</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={startAddCompetition}
          disabled={!canAddMore}
          style={[
            styles.addBtn,
            {
              borderColor: canAddMore ? accent : theme.colors.border,
              opacity: canAddMore ? 1 : 0.45,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add a competition"
        >
          <Ionicons name="add-circle-outline" size={22} color={canAddMore ? accent : theme.colors.textMuted} />
          <Text
            style={[
              styles.addBtnText,
              { color: canAddMore ? accent : theme.colors.textMuted },
            ]}
          >
            Add a competition
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionLabel}>ADDITIONALS</Text>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Festival pass</Text>
          <Text style={styles.toggleHint}>
            One named meeting (Cheltenham / Aintree / Goodwood / Ascot) ·{' '}
            {formatEuro(LEAGUE_BILL_RATES.festivalPass)}
          </Text>
        </View>
        <Switch
          value={input.includeFestivalPass}
          onValueChange={(includeFestivalPass) =>
            setInput((prev) => ({ ...prev, includeFestivalPass }))
          }
          trackColor={{ false: theme.colors.border, true: accent }}
          thumbColor={theme.colors.surface}
        />
      </View>

      <StepperRow
        label="Competition hubs"
        hint={`Tablet in secure box · €${LEAGUE_BILL_RATES.hubDeposit} deposit + €${LEAGUE_BILL_RATES.hubMonthly}/mo while live`}
        value={input.competitionHubs}
        min={LEAGUE_BILL_LIMITS.competitionHubs.min}
        max={LEAGUE_BILL_LIMITS.competitionHubs.max}
        step={1}
        onChange={(competitionHubs) => setInput((prev) => ({ ...prev, competitionHubs }))}
      />

      <View style={styles.divider} />

      {input.competitions.length === 0 && !input.includeFestivalPass && input.competitionHubs === 0 ? (
        <Text style={styles.emptyHint}>Add a competition or additionals to see totals.</Text>
      ) : (
        <>
          {quote.lines.length > 0 ? (
            <>
              {quote.lines.map((line) => (
                <View key={line.label} style={{ marginBottom: 4 }}>
                  <View style={styles.lineRow}>
                    <Text style={styles.lineLabel}>{line.label}</Text>
                    <Text style={styles.lineAmount}>{formatEuro(line.amount)}</Text>
                  </View>
                  {line.detail ? (
                    <Text style={[styles.breakDetail, { color: theme.colors.textMuted }]}>
                      {line.detail}
                    </Text>
                  ) : null}
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>League Bill</Text>
                <Text style={[styles.totalValue, { fontSize: 18 }]}>
                  {formatEuro(quote.seasonTotal)}
                </Text>
              </View>
            </>
          ) : null}

          {quote.dueTodayLines.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>COMPETITION HUBS</Text>
              {quote.dueTodayLines.map((line) => (
                <View key={line.label} style={styles.lineRow}>
                  <Text style={styles.lineLabel}>{line.label}</Text>
                  <Text style={styles.lineAmount}>{formatEuro(line.amount)}</Text>
                </View>
              ))}
              <Text style={styles.deposit}>
                Deposit refundable on return. Hub rental continues at{' '}
                {formatEuro(quote.hubMonthlyTotal)}/mo while live.
              </Text>
            </>
          ) : null}

          <View style={[styles.divider, { marginTop: 12 }]} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Due today</Text>
            <Text style={styles.totalValue}>{formatEuro(quote.dueToday)}</Text>
          </View>
          <Text style={styles.deposit}>
            League Bill
            {quote.hubDepositTotal > 0
              ? ` + hub deposit (${formatEuro(quote.hubDepositTotal)}) + first month hub rental (${formatEuro(quote.hubMonthlyTotal)})`
              : ''}
          </Text>
        </>
      )}

      {quote.competitionSummaries.length > 0 ? (
        <>
          <Text style={styles.capsTitle}>SET WHEN ONBOARDING</Text>
          {quote.recommendedCaps.competitions.map((c, i) => (
            <Text key={`${c.football_mode}_${i}`} style={styles.capText}>
              {i + 1}. {c.football_mode === 'lms' ? 'Last Man Standing' : 'Tipster20'} · cap{' '}
              {c.max_participants} · {c.continuation}
            </Text>
          ))}
          <Text style={styles.capText}>
            Live at once: {quote.recommendedCaps.max_concurrent_creates} · Hubs:{' '}
            {quote.recommendedCaps.kiosk_licenses_count}
            {quote.recommendedCaps.include_festival_pass ? ' · Festival pass: yes' : ''} ·{' '}
            {ASSUMED_SEASON_WEEKS} weeks assumed
          </Text>
        </>
      ) : null}

      <Text style={styles.rateNote}>
        Volume discount: bigger caps get a lower €/player platform rate (down to{' '}
        {formatEuro(LEAGUE_BILL_RATES.platformPerPlayerFloor)}) because some players may convert to
        User Plus / Premium. Tipster20 and LMS continuation options stay mode-specific.
      </Text>
    </View>
  );
}

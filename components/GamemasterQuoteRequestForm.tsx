import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LEAGUE_BILL_LIMITS,
  FOOTBALL_MODE_OPTIONS,
  LMS_CONTINUATION_OPTIONS,
  TIPSTER20_CONTINUATION_OPTIONS,
  createEmptyCompetition,
  type CompetitionDraft,
  type ClubFootballMode,
  type LeagueBillInput,
  type LmsContinuationMode,
  type Tipster20ContinuationMode,
  clampCompetition,
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
  busy?: boolean;
  onRequestQuote: (payload: LeagueBillInput) => Promise<void>;
};

export function GamemasterQuoteRequestForm({ accent, busy, onRequestQuote }: Props) {
  const theme = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<LeagueBillInput>({
    competitions: [],
    competitionHubs: 0,
    includeFestivalPass: false,
  });
  const [draft, setDraft] = useState<CompetitionDraft | null>(null);

  const canAddMore = input.competitions.length < LEAGUE_BILL_LIMITS.maxCompetitions;

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
    setDraft((prev) => (prev ? clampCompetition({ ...prev, ...partial }) : prev));
  };

  const submit = async () => {
    setError(null);
    if (input.competitions.length < 1) {
      setError('Add at least 1 competition for your quote request.');
      return;
    }
    setSubmitting(true);
    try {
      await onRequestQuote(input);
      // keep current selection so they can edit/resend if they want later
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send quote request');
    } finally {
      setSubmitting(false);
    }
  };

  const summaryForMode = (c: CompetitionDraft) => {
    if (c.footballMode === 'lms') {
      const cont = LMS_CONTINUATION_OPTIONS.find((o) => o.key === c.lmsContinuation)?.label;
      return `Last Man Standing · cap ${c.maxPlayers} · ${cont ?? c.lmsContinuation}`;
    }
    const cont = TIPSTER20_CONTINUATION_OPTIONS.find((o) => o.key === c.tipster20Continuation)?.label;
    return `Tipster20 · cap ${c.maxPlayers} · ${cont ?? c.tipster20Continuation}`;
  };

  const busyNow = busy || submitting;

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        Request a quote for an additional club package. You will be asked to confirm on the owner side.
      </Text>

      <Text style={styles.sectionLabel}>COMPETITIONS</Text>
      {input.competitions.length === 0 && !draft ? (
        <Text style={styles.emptyHint}>Add at least 1 competition.</Text>
      ) : null}

      {input.competitions.map((c) => (
        <View key={c.id} style={styles.listedComp}>
          <View style={styles.listedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.listedTitle, { color: theme.colors.text }]}>{summaryForMode(c)}</Text>
            </View>
            <Pressable
              onPress={() => removeCompetition(c.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove competition"
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>
      ))}

      {draft ? (
        <View style={[styles.draftCard, { borderColor: accent }]}>
          <Text style={[styles.draftTitle, { color: theme.colors.text }]}>Add a competition</Text>

          <Text style={styles.sectionLabel}>GAME MODE</Text>
          {renderChoice(FOOTBALL_MODE_OPTIONS, draft.footballMode, (footballMode) =>
            patchDraft({ footballMode: footballMode as ClubFootballMode })
          )}

          <StepperRow
            label="Player cap"
            hint="Used to price your quote."
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
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Add</Text>
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
          <Ionicons
            name="add-circle-outline"
            size={22}
            color={canAddMore ? accent : theme.colors.textMuted}
          />
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
          <Text style={styles.toggleHint}>Optional named meeting.</Text>
        </View>
        <Switch
          value={input.includeFestivalPass}
          onValueChange={(includeFestivalPass) =>
            setInput((prev) => ({ ...prev, includeFestivalPass }))
          }
          trackColor={{ false: theme.colors.border, true: accent }}
          thumbColor={theme.colors.surface}
          disabled={busyNow}
        />
      </View>

      <StepperRow
        label="Competition hubs"
        hint="Tablets in secure boxes."
        value={input.competitionHubs}
        min={LEAGUE_BILL_LIMITS.competitionHubs.min}
        max={LEAGUE_BILL_LIMITS.competitionHubs.max}
        step={1}
        onChange={(competitionHubs) => setInput((prev) => ({ ...prev, competitionHubs }))}
      />

      {error ? <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, busyNow && styles.disabled]}
        disabled={busyNow}
        onPress={() => void submit()}
        accessibilityRole="button"
        accessibilityLabel="Request quote"
      >
        {busyNow ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Send quote request</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#6B7280',
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    marginBottom: 6,
  },
  listedComp: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    backgroundColor: '#111827',
    marginBottom: 8,
  },
  listedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  listedTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  draftCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  draftTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
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
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
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
    marginTop: 4,
  },
  addBtnText: { fontSize: 15, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  toggleLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  toggleHint: {
    fontSize: 12,
    lineHeight: 16,
    color: '#9CA3AF',
    marginTop: 2,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryBtnText: {
    fontFamily: Platform.OS === 'web' ? 'sans-serif' : undefined,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  disabled: { opacity: 0.55 },
  error: { fontSize: 14, fontWeight: '700', marginTop: 4 },
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
});


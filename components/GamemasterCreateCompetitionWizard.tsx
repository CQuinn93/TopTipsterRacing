import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { lmsCreateCompetition, lmsListGameweeks, type LmsGameweek } from '@/lib/lms/api';
import { f2tCreateCompetition } from '@/lib/f2t/api';
import type { GamemasterModeCredit } from '@/lib/gamemasterCredits';

type WizardStep = 'type' | 'name' | 'gameweek' | 'lives';

type Props = {
  visible: boolean;
  credits: GamemasterModeCredit[];
  onClose: () => void;
  onCreated: () => void;
};

const SEASON = '2026/27';

export function GamemasterCreateCompetitionWizard({
  visible,
  credits,
  onClose,
  onCreated,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [step, setStep] = useState<WizardStep>('type');
  const [selected, setSelected] = useState<GamemasterModeCredit | null>(null);
  const [name, setName] = useState('');
  const [gameweeks, setGameweeks] = useState<LmsGameweek[]>([]);
  const [gwId, setGwId] = useState<string | null>(null);
  const [gwsLoading, setGwsLoading] = useState(false);
  const [extraLives, setExtraLives] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('type');
    setSelected(null);
    setName('');
    setGwId(null);
    setExtraLives(0);
    setError(null);
    setBusy(false);
  };

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    let cancelled = false;
    (async () => {
      setGwsLoading(true);
      try {
        const gws = await lmsListGameweeks(SEASON);
        if (cancelled) return;
        setGameweeks(gws);
        const defaultGw =
          gws.find((g) => g.status !== 'complete')?.id ?? gws[0]?.id ?? null;
        setGwId((prev) => prev ?? defaultGw);
      } catch {
        if (!cancelled) setGameweeks([]);
      } finally {
        if (!cancelled) setGwsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const displayCredits =
    credits.length > 0
      ? credits
      : ([
          { mode: 'lms', label: 'Last Man Standing', remaining: 0, quoted: 0, used: 0, quoteId: null },
          { mode: 'f2t', label: 'First2 Twenty', remaining: 0, quoted: 0, used: 0, quoteId: null },
          { mode: 'racing', label: 'Top Tipster Racing', remaining: 0, quoted: 0, used: 0, quoteId: null },
          { mode: 'f2t6', label: 'First2 6', remaining: 0, quoted: 0, used: 0, quoteId: null },
        ] as GamemasterModeCredit[]);

  const close = () => {
    reset();
    onClose();
  };

  const pickType = (credit: GamemasterModeCredit) => {
    if (credit.remaining <= 0 || !credit.quoteId) {
      setError('This type isn’t on your package, or you have no remaining slots.');
      return;
    }
    if (credit.mode !== 'lms' && credit.mode !== 'f2t') {
      setError('Setup for this competition type isn’t available here yet.');
      return;
    }
    setError(null);
    setSelected(credit);
    setStep('name');
  };

  const continueFromName = () => {
    if (!name.trim()) {
      setError('Enter a competition name.');
      return;
    }
    setError(null);
    setStep('gameweek');
  };

  const continueFromGameweek = () => {
    if (!gwId) {
      setError('Choose a starting gameweek.');
      return;
    }
    setError(null);
    if (selected?.mode === 'lms') {
      setStep('lives');
      return;
    }
    void submitCreate(0);
  };

  const submitCreate = async (lives: 0 | 1) => {
    if (!selected?.quoteId || !gwId || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.mode === 'lms') {
        const res = await lmsCreateCompetition(
          name.trim(),
          gwId,
          SEASON,
          undefined,
          lives,
          { gamemasterQuoteId: selected.quoteId }
        );
        if (!res.success) {
          throw new Error(res.error ?? 'Could not create competition');
        }
      } else if (selected.mode === 'f2t') {
        const res = await f2tCreateCompetition(name.trim(), gwId, SEASON, undefined, {
          gamemasterQuoteId: selected.quoteId,
        });
        if (!res.success) {
          throw new Error(res.error ?? 'Could not create competition');
        }
      } else {
        throw new Error('Unsupported competition type');
      }

      const message =
        'All set up. Visit your competition home screen to manage join codes and settings.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('All set up', message);
      }
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create competition');
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === 'type'
      ? 'Choose competition type'
      : step === 'name'
        ? 'Name your competition'
        : step === 'gameweek'
          ? 'Starting gameweek'
          : 'Extra lives';

  const body =
    step === 'type'
      ? 'Types included in your package are highlighted. Others stay unavailable until they are on a quote.'
      : step === 'name'
        ? `Creating ${selected?.label ?? 'competition'}. Give it a name players will recognise.`
        : step === 'gameweek'
          ? 'Players start picking from this Premier League gameweek onwards.'
          : 'Choose how many extra lives each player gets (0 or 1).';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {step === 'type' ? (
            <View style={styles.grid}>
              {displayCredits.map((credit) => {
                const enabled = credit.remaining > 0 && !!credit.quoteId;
                return (
                  <Pressable
                    key={credit.mode}
                    style={[styles.typeCard, !enabled && styles.typeCardDimmed]}
                    disabled={!enabled || busy}
                    onPress={() => pickType(credit)}
                  >
                    <Text style={[styles.typeTitle, !enabled && styles.dimmedText]}>
                      {credit.label}
                    </Text>
                    <Text style={[styles.typeMeta, !enabled && styles.dimmedText]}>
                      {enabled ? `Remaining: ${credit.remaining}` : 'Not on your package'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {step === 'name' ? (
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Competition name"
              placeholderTextColor={theme.colors.textMuted}
              editable={!busy}
              autoFocus
            />
          ) : null}

          {step === 'gameweek' ? (
            gwsLoading ? (
              <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={styles.gwScroll} contentContainerStyle={styles.gwRow}>
                {gameweeks
                  .filter((g) => g.status !== 'complete')
                  .slice(0, 24)
                  .map((g) => {
                    const active = gwId === g.id;
                    return (
                      <Pressable
                        key={g.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setGwId(g.id)}
                        disabled={busy}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          GW{g.number}
                        </Text>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            )
          ) : null}

          {step === 'lives' ? (
            <View style={styles.livesRow}>
              {([0, 1] as const).map((n) => {
                const active = extraLives === n;
                return (
                  <Pressable
                    key={n}
                    style={[styles.livesCard, active && styles.livesCardActive]}
                    onPress={() => setExtraLives(n)}
                    disabled={busy}
                  >
                    <Text style={[styles.livesValue, active && styles.livesValueActive]}>
                      {n === 0 ? 'None' : '1'}
                    </Text>
                    <Text style={[styles.livesHint, active && styles.livesHintActive]}>
                      {n === 0 ? 'No extra lives' : 'One extra life'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.actions}>
            {step !== 'type' ? (
              <Pressable
                style={styles.secondaryBtn}
                disabled={busy}
                onPress={() => {
                  setError(null);
                  if (step === 'name') setStep('type');
                  else if (step === 'gameweek') setStep('name');
                  else if (step === 'lives') setStep('gameweek');
                }}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.secondaryBtn} onPress={close} disabled={busy}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            )}

            {step === 'name' ? (
              <Pressable
                style={[styles.primaryBtn, busy && styles.disabled]}
                onPress={continueFromName}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
            ) : null}

            {step === 'gameweek' ? (
              <Pressable
                style={[styles.primaryBtn, busy && styles.disabled]}
                onPress={continueFromGameweek}
                disabled={busy || gwsLoading}
              >
                {busy && selected?.mode !== 'lms' ? (
                  <ActivityIndicator color={theme.colors.background} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {selected?.mode === 'lms' ? 'Continue' : 'Create'}
                  </Text>
                )}
              </Pressable>
            ) : null}

            {step === 'lives' ? (
              <Pressable
                style={[styles.primaryBtn, busy && styles.disabled]}
                onPress={() => void submitCreate(extraLives)}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.background} />
                ) : (
                  <Text style={styles.primaryBtnText}>Create</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    sheet: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      gap: 12,
      maxWidth: 520,
      width: '100%',
      alignSelf: 'center',
      maxHeight: '90%',
    },
    title: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 20,
      color: theme.colors.text,
    },
    body: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    error: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      color: theme.colors.error,
    },
    grid: { gap: 10, marginTop: 4 },
    typeCard: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
      gap: 4,
    },
    typeCardDimmed: {
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      opacity: 0.45,
    },
    typeTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 16,
      color: theme.colors.text,
    },
    typeMeta: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      color: theme.colors.accent,
    },
    dimmedText: { color: theme.colors.textMuted },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 16,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
    },
    gwScroll: { maxHeight: 160 },
    gwRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingVertical: 4,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    chipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    chipText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    chipTextActive: { color: theme.colors.accent },
    livesRow: { flexDirection: 'row', gap: 10 },
    livesCard: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      gap: 4,
      alignItems: 'center',
    },
    livesCardActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    livesValue: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.text,
    },
    livesValueActive: { color: theme.colors.accent },
    livesHint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    livesHintActive: { color: theme.colors.text },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    primaryBtn: {
      flex: 1,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    primaryBtnText: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 15,
      color: theme.colors.background,
    },
    secondaryBtn: {
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    secondaryBtnText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    disabled: { opacity: 0.6 },
  });
}

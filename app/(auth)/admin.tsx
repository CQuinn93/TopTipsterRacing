import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { theme } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

const ADMIN_CODE = '777777';

const IRISH_COURSES = [
  'Ballinrobe', 'Bellewstown', 'Clonmel', 'Cork', 'The Curragh', 'Down Royal', 'Downpatrick', 'Dundalk',
  'Fairyhouse', 'Galway', 'Gowran Park', 'Kilbeggan', 'Killarney', 'Laytown', 'Leopardstown', 'Limerick',
  'Listowel', 'Naas', 'Navan', 'Punchestown', 'Roscommon', 'Sligo', 'Thurles', 'Tipperary', 'Tramore', 'Wexford',
].sort((a, b) => a.localeCompare(b));

const ENGLAND_COURSES = [
  'Aintree', 'Ascot', 'Bath', 'Beverley', 'Brighton', 'Carlisle', 'Cartmel', 'Catterick', 'Chelmsford City',
  'Cheltenham', 'Chester', 'Doncaster', 'Epsom Downs', 'Exeter', 'Fakenham', 'Fontwell Park', 'Goodwood',
  'Great Yarmouth', 'Haydock Park', 'Hereford', 'Hexham', 'Huntingdon', 'Kempton Park', 'Leicester',
  'Lingfield Park', 'Ludlow', 'Market Rasen', 'Newbury', 'Newcastle', 'Newmarket', 'Newton Abbot', 'Nottingham',
  'Plumpton', 'Pontefract', 'Redcar', 'Ripon', 'Salisbury', 'Sandown Park', 'Sedgefield', 'Southwell',
  'Stratford-on-Avon', 'Taunton', 'Thirsk', 'Uttoxeter', 'Warwick', 'Wetherby', 'Wincanton', 'Windsor',
  'Wolverhampton', 'Worcester', 'York',
].sort((a, b) => a.localeCompare(b));

const COURSES = [...IRISH_COURSES, ...ENGLAND_COURSES];

type CourseRegionFilter = 'all' | 'ireland' | 'england';

function formatDateToYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYYYYMMDD(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

const UK_TIMEZONE = 'Europe/London';

/** Current hour (0–23) in UK time. */
function getUKHour(): number {
  const parts = new Date().toLocaleString('en-GB', { timeZone: UK_TIMEZONE, hour: '2-digit', hour12: false }).split(':');
  return parseInt(parts[0], 10) || 0;
}

/** Current date string (YYYY-MM-DD) in UK time. */
function getUKDateStr(): string {
  const [d, m, y] = new Date().toLocaleString('en-GB', { timeZone: UK_TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Earliest selectable festival start date.
 * Competitions for the following day can only be created before 8pm UK; after 8pm UK the next run is 9pm
 * so we require start ≥ day after tomorrow. Before 8pm UK we allow start = tomorrow.
 */
function getMinStartDate(): Date {
  const ukDateStr = getUKDateStr();
  const ukHour = getUKHour();
  const tomorrow = new Date(ukDateStr + 'T12:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  if (ukHour < 20) {
    return tomorrow; // before 8pm UK: allow tomorrow
  }
  return dayAfter; // 8pm UK or later: require day after tomorrow
}

/** True if the competition date range includes tomorrow and it's already 8pm or later UK (creation not allowed). */
function isCreationAfterCutoffForTomorrow(start: string, end: string): boolean {
  const ukDateStr = getUKDateStr();
  const tomorrow = new Date(ukDateStr + 'T12:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateToYYYYMMDD(tomorrow);
  if (start > tomorrowStr || end < tomorrowStr) return false; // range doesn't include tomorrow
  return getUKHour() >= 20; // 8pm UK or later
}

function getMinStartDateStr(): string {
  return formatDateToYYYYMMDD(getMinStartDate());
}

type PendingRequest = {
  id: string;
  competition_id: string;
  competition_name: string;
  user_id: string;
  display_name: string;
  created_at: string;
};

type Competition = {
  id: string;
  name: string;
};

type AdminSelectionRow = {
  id: string;
  display_name: string;
  race_date: string;
  selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>;
};

type TabId = 'requests' | 'create' | 'selections';

export default function AdminScreen() {
  const activeTheme = useTheme();
  const [tab, setTab] = useState<TabId>('requests');
  const [list, setList] = useState<PendingRequest[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectionsList, setSelectionsList] = useState<AdminSelectionRow[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedRaceDate, setSelectedRaceDate] = useState<string | null>(null);
  const [raceDays, setRaceDays] = useState<{ race_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Create competition form
  const [newName, setNewName] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [courseRegionFilter, setCourseRegionFilter] = useState<CourseRegionFilter>('all');
  const [datePickerOpen, setDatePickerOpen] = useState<'start' | 'end' | null>(null);
  const [datePickerTempDate, setDatePickerTempDate] = useState(new Date());
  const [newAccessCode, setNewAccessCode] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [pendingRes, compsRes] = await Promise.all([
        supabase.rpc('admin_list_pending', { p_admin_code: ADMIN_CODE }),
        supabase.from('competitions').select('id, name').order('name'),
      ]);
      if (pendingRes.error) throw pendingRes.error;
      if (compsRes.error) throw compsRes.error;
      setList((pendingRes.data as PendingRequest[]) ?? []);
      setCompetitions((compsRes.data as Competition[]) ?? []);
    } catch {
      setList([]);
      setCompetitions([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (coursePickerOpen) {
      setCourseSearchQuery('');
      setCourseRegionFilter('all');
    }
  }, [coursePickerOpen]);

  useEffect(() => {
    if (tab !== 'selections' || !selectedCompId) {
      setSelectionsList([]);
      setRaceDays([]);
      setSelectedRaceDate(null);
      return;
    }
    (async () => {
      const days = await fetchRaceDaysForCompetition(supabase, selectedCompId, 'race_date');
      setRaceDays(days as { race_date: string }[]);
      if (days?.length && !selectedRaceDate) setSelectedRaceDate(days[0].race_date);
    })();
  }, [tab, selectedCompId]);

  useEffect(() => {
    if (tab !== 'selections' || !selectedCompId || !selectedRaceDate) {
      setSelectionsList([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc('admin_list_selections', {
        p_admin_code: ADMIN_CODE,
        p_competition_id: selectedCompId,
      });
      if (error) {
        setSelectionsList([]);
        return;
      }
      // PostgREST may return a single jsonb as [array]; unwrap if needed
      const raw = data;
      const all: AdminSelectionRow[] =
        Array.isArray(raw) && raw.length === 1 && Array.isArray(raw[0])
          ? (raw[0] as AdminSelectionRow[])
          : (Array.isArray(raw) ? (raw as AdminSelectionRow[]) : []);
      setSelectionsList(all.filter((s) => String(s.race_date) === String(selectedRaceDate)));
    })();
  }, [tab, selectedCompId, selectedRaceDate]);

  const requestsByCompetition = useMemo(() => {
    const map = new Map<string, PendingRequest[]>();
    for (const r of list) {
      const arr = map.get(r.competition_name) ?? [];
      arr.push(r);
      map.set(r.competition_name, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  const filteredCourses = useMemo(() => {
    const byRegion =
      courseRegionFilter === 'ireland'
        ? IRISH_COURSES
        : courseRegionFilter === 'england'
          ? ENGLAND_COURSES
          : COURSES;
    const q = courseSearchQuery.trim().toLowerCase();
    if (!q) return byRegion;
    return byRegion.filter((c) => c.toLowerCase().includes(q));
  }, [courseRegionFilter, courseSearchQuery]);

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      const { data, error } = await supabase.rpc('admin_approve_request', {
        p_admin_code: ADMIN_CODE,
        p_request_id: id,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        Alert.alert('Error', result?.error ?? 'Could not approve');
        return;
      }
      setList((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not approve');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    try {
      const { data, error } = await supabase.rpc('admin_reject_request', {
        p_admin_code: ADMIN_CODE,
        p_request_id: id,
      });
      if (error) throw error;
      const result = data as { success?: boolean };
      if (!result?.success) return;
      setList((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not reject');
    } finally {
      setActingId(null);
    }
  };

  const handleCreateCompetition = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Error', 'Please enter a competition name.');
      return;
    }
    const start = newStartDate.trim() || null;
    const end = newEndDate.trim() || null;
    if (!start || !end) {
      Alert.alert('Error', 'Please enter festival start and end dates (YYYY-MM-DD).');
      return;
    }
    const minStart = getMinStartDateStr();
    if (start < minStart) {
      Alert.alert('Error', `Start date must be ${minStart} or later. Race data is pulled the day before; competitions for tomorrow can only be created before 8pm UK.`);
      return;
    }
    if (isCreationAfterCutoffForTomorrow(start, end)) {
      Alert.alert('Error', 'Competitions for the following day can only be created before 8pm UK. Please set the start date to the day after tomorrow or try again tomorrow before 8pm UK.');
      return;
    }
    const course = newCourse.trim();
    if (!course) {
      Alert.alert('Error', 'Please select a course.');
      return;
    }
    const code = newAccessCode.trim().toUpperCase().slice(0, 6) || null;
    setCreateLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_competition', {
        p_admin_code: ADMIN_CODE,
        p_name: name,
        p_festival_start_date: start,
        p_festival_end_date: end,
        p_selection_open_utc: '10:00',
        p_selection_close_minutes_before_first_race: 60,
        p_access_code: code,
        p_courses: [course],
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        Alert.alert('Error', result?.error ?? 'Could not create competition');
        return;
      }
      Alert.alert('Created', 'Competition created.');
      setNewName('');
      setNewStartDate('');
      setNewEndDate('');
      setNewCourse('');
      setNewAccessCode('');
      load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create');
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditSelection = (selectionId: string, competitionId: string, raceDate: string) => {
    router.push({
      pathname: '/(auth)/admin-edit-selection',
      params: { selectionId, competitionId, raceDate },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: activeTheme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/tablet-mode')}>
          <Text style={styles.backButtonText}>Exit admin</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'requests' && styles.tabActive]}
          onPress={() => setTab('requests')}
        >
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>Join requests</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'create' && styles.tabActive]}
          onPress={() => setTab('create')}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>New competition</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'selections' && styles.tabActive]}
          onPress={() => setTab('selections')}
        >
          <Text style={[styles.tabText, tab === 'selections' && styles.tabTextActive]}>Edit selections</Text>
        </TouchableOpacity>
      </View>

      {loading && tab === 'requests' ? (
        <ActivityIndicator size="large" color={theme.colors.accent} style={styles.loader} />
      ) : tab === 'requests' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />
          }
        >
          <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
          {requestsByCompetition.length === 0 ? (
            <Text style={styles.empty}>No pending requests</Text>
          ) : (
            requestsByCompetition.map(([compName, requests]) => (
              <View key={compName} style={styles.section}>
                <Text style={styles.sectionTitle}>{compName}</Text>
                {requests.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <Text style={styles.cardName}>{r.display_name}</Text>
                    <Text style={styles.cardDate}>{new Date(r.created_at).toLocaleString()}</Text>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.approveBtn, actingId === r.id && styles.buttonDisabled]}
                        onPress={() => handleApprove(r.id)}
                        disabled={actingId !== null}
                      >
                        {actingId === r.id ? (
                          <ActivityIndicator size="small" color={theme.colors.black} />
                        ) : (
                          <Text style={styles.approveBtnText}>Approve</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.rejectBtn, actingId === r.id && styles.buttonDisabled]}
                        onPress={() => handleReject(r.id)}
                        disabled={actingId !== null}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      ) : tab === 'create' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.formContent}>
          <Text style={styles.formLabel}>Competition name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Pat Nutter 2027"
            placeholderTextColor={theme.colors.textMuted}
            value={newName}
            onChangeText={setNewName}
            editable={!createLoading}
          />
          <Text style={styles.formLabel}>Festival start date (min 2 days ahead – race data pulls the day before)</Text>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              min={getMinStartDateStr()}
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              disabled={createLoading}
              style={{
                fontFamily: theme.fontFamily.input,
                fontSize: 16,
                color: theme.colors.text,
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 8,
                padding: 12,
                width: '100%',
              }}
            />
          ) : (
            <TouchableOpacity
              style={[styles.input, styles.coursePickerTrigger]}
              onPress={() => {
                if (createLoading) return;
                const parsed = parseYYYYMMDD(newStartDate);
                const minDate = getMinStartDate();
                setDatePickerTempDate(parsed && parsed >= minDate ? parsed : minDate);
                setDatePickerOpen('start');
              }}
              disabled={createLoading}
            >
              <Text style={[styles.coursePickerTriggerText, !newStartDate && { color: theme.colors.textMuted }]}>
                {newStartDate || 'Select start date'}
              </Text>
              <Text style={styles.coursePickerChevron}>📅</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.formLabel}>Festival end date</Text>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              min={newStartDate || getMinStartDateStr()}
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              disabled={createLoading}
              style={{
                fontFamily: theme.fontFamily.input,
                fontSize: 16,
                color: theme.colors.text,
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 8,
                padding: 12,
                width: '100%',
              }}
            />
          ) : (
            <TouchableOpacity
              style={[styles.input, styles.coursePickerTrigger]}
              onPress={() => {
                if (createLoading) return;
                const startDate = parseYYYYMMDD(newStartDate) || getMinStartDate();
                const parsed = parseYYYYMMDD(newEndDate);
                const minEnd = startDate;
                setDatePickerTempDate(parsed && parsed >= minEnd ? parsed : minEnd);
                setDatePickerOpen('end');
              }}
              disabled={createLoading}
            >
              <Text style={[styles.coursePickerTriggerText, !newEndDate && { color: theme.colors.textMuted }]}>
                {newEndDate || 'Select end date'}
              </Text>
              <Text style={styles.coursePickerChevron}>📅</Text>
            </TouchableOpacity>
          )}
          {datePickerOpen && Platform.OS !== 'web' && (
            <Modal visible transparent animationType="fade">
              <Pressable style={styles.modalOverlay} onPress={() => setDatePickerOpen(null)}>
                <Pressable style={styles.datePickerModalContent} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {datePickerOpen === 'start' ? 'Select start date (min 2 days ahead)' : 'Select end date'}
                    </Text>
                    <View style={styles.datePickerActions}>
                      <TouchableOpacity
                        onPress={() => {
                          const formatted = formatDateToYYYYMMDD(datePickerTempDate);
                          if (datePickerOpen === 'start') setNewStartDate(formatted);
                          else setNewEndDate(formatted);
                          setDatePickerOpen(null);
                        }}
                      >
                        <Text style={styles.modalClose}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <DateTimePicker
                    value={datePickerTempDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                    minimumDate={datePickerOpen === 'start' ? getMinStartDate() : parseYYYYMMDD(newStartDate) || getMinStartDate()}
                    onChange={(_, d) => d && setDatePickerTempDate(d)}
                  />
                </Pressable>
              </Pressable>
            </Modal>
          )}
          <Text style={styles.formLabel}>Course (one venue)</Text>
          <TouchableOpacity
            style={[styles.input, styles.coursePickerTrigger]}
            onPress={() => !createLoading && setCoursePickerOpen(true)}
            disabled={createLoading}
          >
            <Text style={[styles.coursePickerTriggerText, !newCourse && { color: theme.colors.textMuted }]}>
              {newCourse || 'Select course'}
            </Text>
            <Text style={styles.coursePickerChevron}>▼</Text>
          </TouchableOpacity>
          <Modal
            visible={coursePickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setCoursePickerOpen(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setCoursePickerOpen(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select course</Text>
                  <TouchableOpacity onPress={() => setCoursePickerOpen(false)}>
                    <Text style={styles.modalClose}>Done</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.courseSearchInput}
                  placeholder="Search courses..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={courseSearchQuery}
                  onChangeText={setCourseSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.courseFilterRow}>
                  <TouchableOpacity
                    style={[styles.courseFilterChip, courseRegionFilter === 'all' && styles.courseFilterChipActive]}
                    onPress={() => setCourseRegionFilter('all')}
                  >
                    <Text style={[styles.courseFilterChipText, courseRegionFilter === 'all' && styles.courseFilterChipTextActive]}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.courseFilterChip, courseRegionFilter === 'ireland' && styles.courseFilterChipActive]}
                    onPress={() => setCourseRegionFilter('ireland')}
                  >
                    <Text style={[styles.courseFilterChipText, courseRegionFilter === 'ireland' && styles.courseFilterChipTextActive]}>Ireland</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.courseFilterChip, courseRegionFilter === 'england' && styles.courseFilterChipActive]}
                    onPress={() => setCourseRegionFilter('england')}
                  >
                    <Text style={[styles.courseFilterChipText, courseRegionFilter === 'england' && styles.courseFilterChipTextActive]}>England</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={filteredCourses}
                  keyExtractor={(item) => item}
                  style={styles.courseList}
                  initialNumToRender={20}
                  ListEmptyComponent={<Text style={styles.courseListEmpty}>No courses match</Text>}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.courseItem, item === newCourse && styles.courseItemActive]}
                      onPress={() => {
                        setNewCourse(item);
                        setCoursePickerOpen(false);
                      }}
                    >
                      <Text style={[styles.courseItemText, item === newCourse && styles.courseItemTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </Pressable>
            </Pressable>
          </Modal>
          <Text style={styles.formLabel}>Access code (optional, 6 characters)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. PN2027"
            placeholderTextColor={theme.colors.textMuted}
            value={newAccessCode}
            onChangeText={setNewAccessCode}
            maxLength={6}
            autoCapitalize="characters"
            editable={!createLoading}
          />
          <TouchableOpacity
            style={[styles.createButton, createLoading && styles.buttonDisabled]}
            onPress={handleCreateCompetition}
            disabled={createLoading}
          >
            {createLoading ? (
              <ActivityIndicator color={theme.colors.black} />
            ) : (
              <Text style={styles.createButtonText}>Create competition</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.editSelectionsIntro}>
            <Text style={styles.editSelectionsTitle}>Edit a user’s selections</Text>
            <Text style={styles.editSelectionsHint}>
              Choose a competition and race day, then tap a participant to change their picks. Changes are allowed even after the deadline.
            </Text>
          </View>

          <Text style={styles.stepLabel}>1. Competition</Text>
          {competitions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No competitions</Text>
              <Text style={styles.emptyDetail}>Create one in the “New competition” tab. Race days appear after pull-races runs for the festival dates.</Text>
            </View>
          ) : (
            <View style={styles.chipRow}>
              {competitions.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, selectedCompId === c.id && styles.chipActive]}
                  onPress={() => setSelectedCompId(selectedCompId === c.id ? null : c.id)}
                >
                  <Text style={[styles.chipText, selectedCompId === c.id && styles.chipTextActive]} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedCompId && (
            <>
              <Text style={styles.stepLabel}>2. Race day</Text>
              {raceDays.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No race days</Text>
                  <Text style={styles.emptyDetail}>Make sure pull-races has run for this competition’s festival dates. Race days appear here once data is loaded.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRowScroll}>
                  {raceDays.map((d) => (
                    <TouchableOpacity
                      key={d.race_date}
                      style={[styles.chip, selectedRaceDate === d.race_date && styles.chipActive]}
                      onPress={() => setSelectedRaceDate(d.race_date)}
                    >
                      <Text style={[styles.chipText, selectedRaceDate === d.race_date && styles.chipTextActive]}>
                        {new Date(d.race_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {selectedCompId && selectedRaceDate && (
            <>
              <Text style={styles.stepLabel}>3. Participants — tap to edit</Text>
              {selectionsList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No selections for this day</Text>
                  <Text style={styles.emptyDetail}>Participants will appear here once they have made (or been assigned) selections for {new Date(selectedRaceDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}.</Text>
                </View>
              ) : (
                selectionsList.map((row) => (
                  <TouchableOpacity
                    key={row.id}
                    style={styles.selectionCard}
                    onPress={() => openEditSelection(row.id, selectedCompId, row.race_date)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.selectionCardName}>{row.display_name}</Text>
                    <Text style={styles.selectionCardMeta}>
                      {Object.keys(row.selections || {}).length} race(s) selected
                    </Text>
                    <Text style={styles.selectionCardEdit}>Tap to edit →</Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  title: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 24,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  backButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.accent,
    textDecorationLine: 'underline',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
  },
  tab: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: theme.colors.accent },
  tabText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  tabTextActive: { color: theme.colors.accent },
  loader: { marginTop: theme.spacing.xl },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  formContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  formLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  input: {
    fontFamily: theme.fontFamily.input,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  coursePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coursePickerTriggerText: {
    fontFamily: theme.fontFamily.input,
    fontSize: 16,
    color: theme.colors.text,
  },
  coursePickerChevron: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    maxHeight: '70%',
  },
  datePickerModalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.lg,
  },
  datePickerActions: { flexDirection: 'row' },
  pullToRefreshHint: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.text,
  },
  modalClose: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  courseSearchInput: {
    fontFamily: theme.fontFamily.input,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  courseFilterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  courseFilterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  courseFilterChipActive: { backgroundColor: theme.colors.accentMuted, borderColor: theme.colors.accent },
  courseFilterChipText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  courseFilterChipTextActive: { color: theme.colors.accent, fontWeight: '600' },
  courseList: { maxHeight: 400 },
  courseListEmpty: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    padding: theme.spacing.lg,
  },
  courseItem: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  courseItemActive: { backgroundColor: theme.colors.accentMuted },
  courseItemText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.text,
  },
  courseItemTextActive: { color: theme.colors.accent, fontWeight: '600' },
  createButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.xl,
  },
  createButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.black,
    fontWeight: '600',
  },
  empty: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.accent,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardName: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.text,
  },
  cardDate: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  editHint: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.accent,
    marginTop: theme.spacing.xs,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  approveBtn: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  approveBtnText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.black,
    fontWeight: '600',
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  rejectBtnText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.text,
  },
  buttonDisabled: { opacity: 0.7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  chipRowScroll: { flexDirection: 'row', marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.accentMuted, borderColor: theme.colors.accent },
  chipText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.accent },
  editSelectionsIntro: {
    marginBottom: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  editSelectionsTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  editSelectionsHint: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  stepLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  emptyDetail: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 19,
  },
  selectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectionCardName: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  selectionCardMeta: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  selectionCardEdit: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.accent,
    marginTop: theme.spacing.xs,
  },
});

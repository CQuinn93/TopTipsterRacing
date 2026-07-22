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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

const IRISH_COURSES = [
  'Ballinrobe', 'Bellewstown', 'Clonmel', 'Cork', 'The Curragh', 'Down Royal', 'Downpatrick', 'Dundalk',
  'Fairyhouse', 'Galway', 'Gowran Park', 'Kilbeggan', 'Killarney', 'Laytown', 'Leopardstown', 'Limerick',
  'Listowel', 'Naas', 'Navan', 'Punchestown', 'Roscommon', 'Sligo', 'Thurles', 'Tipperary', 'Tramore', 'Wexford',
].sort((a, b) => a.localeCompare(b));

const ENGLAND_COURSES = [
  'Aintree', 'Ascot', 'Bath', 'Beverley', 'Brighton', 'Carlisle', 'Cartmel', 'Catterick Bridge', 'Chelmsford City',
  'Cheltenham', 'Chester', 'Doncaster', 'Epsom Downs', 'Exeter', 'Fakenham', 'Fontwell Park', 'Goodwood',
  'Great Yarmouth', 'Haydock Park', 'Hereford', 'Hexham', 'Huntingdon', 'Kempton Park', 'Leicester',
  'Lingfield Park', 'Ludlow', 'Market Rasen', 'Newbury', 'Newcastle', 'Newmarket', 'Newton Abbot', 'Nottingham',
  'Plumpton', 'Pontefract', 'Redcar', 'Ripon', 'Salisbury', 'Sandown Park', 'Sedgefield', 'Southwell',
  'Stratford-on-Avon', 'Taunton', 'Thirsk', 'Uttoxeter', 'Warwick', 'Wetherby', 'Wincanton', 'Windsor',
  'Wolverhampton', 'Worcester', 'York',
].sort((a, b) => a.localeCompare(b));

const COURSES = [...IRISH_COURSES, ...ENGLAND_COURSES];

/** RN Web's `Alert.alert` often does not show; use `window.alert` so admin actions give visible feedback. */
function adminAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(message != null && message !== '' ? `${title}\n\n${message}` : title);
    }
    return;
  }
  if (message != null && message !== '') {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
}

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

type AdminAccessRequest = {
  id: string;
  user_id: string;
  username: string | null;
  created_at: string;
};

type AdminCompetitionListRow = {
  id: string;
  name: string;
  access_code: string | null;
  festival_start_date: string;
  festival_end_date: string;
  created_by_user_id: string | null;
  creator_username: string | null;
  display_status: 'upcoming' | 'live' | 'complete';
};

type TabId = 'requests' | 'admins' | 'create' | 'competitionList' | 'selections';

export default function AdminScreen() {
  const activeTheme = useTheme();
  const styles = useMemo(() => createAdminStyles(activeTheme), [activeTheme]);
  const params = useLocalSearchParams<{ code?: string; returnTo?: string }>();
  const adminCode = String(params.code ?? '').trim();
  const returnToRaw = String(params.returnTo ?? '').trim();
  const returnTo =
    returnToRaw === '/(auth)/tablet-mode' || returnToRaw.startsWith('/(app)')
      ? returnToRaw
      : '/(auth)/tablet-mode';
  const [tab, setTab] = useState<TabId>('requests');
  const [list, setList] = useState<PendingRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminAccessRequest[]>([]);
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
  const [adminCompetitionsList, setAdminCompetitionsList] = useState<AdminCompetitionListRow[]>([]);
  const [compListFilter, setCompListFilter] = useState<'live' | 'upcoming' | 'complete'>('live');

  const adminCompetitionsFiltered = useMemo(
    () => adminCompetitionsList.filter((c) => c.display_status === compListFilter),
    [adminCompetitionsList, compListFilter]
  );

  const load = async () => {
    if (!adminCode) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const [pendingRes, adminReqRes, adminListRes] = await Promise.all([
        supabase.rpc('admin_list_pending', { p_code: adminCode }),
        supabase.rpc('admin_list_access_requests', { p_code: adminCode }),
        supabase.rpc('admin_list_competitions', { p_code: adminCode }),
      ]);
      if (pendingRes.error) throw pendingRes.error;
      if (adminReqRes.error) throw adminReqRes.error;
      setList((pendingRes.data as PendingRequest[]) ?? []);
      setAdminRequests((adminReqRes.data as AdminAccessRequest[]) ?? []);
      if (adminListRes.error) {
        const { data: compsFallback } = await supabase.from('competitions').select('id, name').order('name');
        setAdminCompetitionsList([]);
        setCompetitions((compsFallback as Competition[]) ?? []);
      } else {
        const rawList = adminListRes.data as unknown;
        const fullList: AdminCompetitionListRow[] = Array.isArray(rawList) ? (rawList as AdminCompetitionListRow[]) : [];
        setAdminCompetitionsList(fullList);
        setCompetitions(fullList.map((c) => ({ id: c.id, name: c.name })));
      }
    } catch {
      setList([]);
      setAdminRequests([]);
      setAdminCompetitionsList([]);
      setCompetitions([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [adminCode]);

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
        p_code: adminCode,
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
  }, [tab, selectedCompId, selectedRaceDate, adminCode]);

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
        p_code: adminCode,
        p_request_id: id,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        adminAlert('Error', result?.error ?? 'Could not approve');
        return;
      }
      setList((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      adminAlert('Error', e instanceof Error ? e.message : 'Could not approve');
    } finally {
      setActingId(null);
    }
  };

  const handleApproveAdmin = async (id: string) => {
    setActingId(id);
    try {
      const { data, error } = await supabase.rpc('admin_approve_access_request', {
        p_code: adminCode,
        p_request_id: id,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        adminAlert('Error', result?.error ?? 'Could not approve admin request');
        return;
      }
      setAdminRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      adminAlert('Error', e instanceof Error ? e.message : 'Could not approve admin request');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    try {
      const { data, error } = await supabase.rpc('admin_reject_request', {
        p_code: adminCode,
        p_request_id: id,
      });
      if (error) throw error;
      const result = data as { success?: boolean };
      if (!result?.success) return;
      setList((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      adminAlert('Error', e instanceof Error ? e.message : 'Could not reject');
    } finally {
      setActingId(null);
    }
  };

  const handleRejectAdmin = async (id: string) => {
    setActingId(id);
    try {
      const { data, error } = await supabase.rpc('admin_reject_access_request', {
        p_code: adminCode,
        p_request_id: id,
      });
      if (error) throw error;
      const result = data as { success?: boolean };
      if (!result?.success) return;
      setAdminRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      adminAlert('Error', e instanceof Error ? e.message : 'Could not reject admin request');
    } finally {
      setActingId(null);
    }
  };

  const handleCreateCompetition = async () => {
    const name = newName.trim();
    if (!name) {
      adminAlert('Error', 'Please enter a competition name.');
      return;
    }
    const start = newStartDate.trim() || null;
    const end = newEndDate.trim() || null;
    if (!start || !end) {
      adminAlert('Error', 'Please enter festival start and end dates (YYYY-MM-DD).');
      return;
    }
    const minStart = getMinStartDateStr();
    if (start < minStart) {
      adminAlert('Error', `Start date must be ${minStart} or later. Race data is pulled the day before; competitions for tomorrow can only be created before 8pm UK.`);
      return;
    }
    if (isCreationAfterCutoffForTomorrow(start, end)) {
      adminAlert('Error', 'Competitions for the following day can only be created before 8pm UK. Please set the start date to the day after tomorrow or try again tomorrow before 8pm UK.');
      return;
    }
    const course = newCourse.trim();
    if (!course) {
      adminAlert('Error', 'Please select a course.');
      return;
    }
    const code = newAccessCode.trim().toUpperCase().slice(0, 6) || null;
    setCreateLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_competition', {
        p_code: adminCode,
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
        adminAlert('Error', result?.error ?? 'Could not create competition');
        return;
      }
      adminAlert('Created', 'Competition created.');
      setNewName('');
      setNewStartDate('');
      setNewEndDate('');
      setNewCourse('');
      setNewAccessCode('');
      load();
    } catch (e: unknown) {
      adminAlert('Error', e instanceof Error ? e.message : 'Could not create');
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditSelection = (selectionId: string, competitionId: string, raceDate: string) => {
    router.push({
      pathname: '/(auth)/admin-edit-selection',
      params: { selectionId, competitionId, raceDate, code: adminCode, returnTo },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: activeTheme.colors.background }]} edges={['top']}>
      {!adminCode ? (
        <View style={styles.scrollContent}>
          <Text style={styles.empty}>Admin session expired. Please reopen Admin tools from the menu.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace(returnTo as any)}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <>
      <View style={styles.adminChrome}>
        <View style={styles.adminChromeTop}>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={14} color={activeTheme.colors.barAccent} />
            <Text style={styles.adminBadgeText}>Admin console</Text>
          </View>
          <TouchableOpacity style={styles.exitPill} onPress={() => router.replace(returnTo as any)} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={16} color={activeTheme.colors.textSecondary} />
            <Text style={styles.exitPillText}>Exit</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Operations</Text>
        <Text style={styles.adminSubTitle}>
          Join requests, admin access, competition list (codes & creators), new competitions, and selection edits.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}
      >
        {(
          [
            { id: 'requests' as const, label: 'Join requests', icon: 'people-outline' as const },
            { id: 'admins' as const, label: 'Admin access', icon: 'key-outline' as const },
            { id: 'create' as const, label: 'New competition', icon: 'add-circle-outline' as const },
            { id: 'competitionList' as const, label: 'Competitions', icon: 'trophy-outline' as const },
            { id: 'selections' as const, label: 'Edit selections', icon: 'create-outline' as const },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.tabPill, active && styles.tabPillActive]}
              onPress={() => setTab(item.id)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={item.icon}
                size={16}
                color={active ? activeTheme.colors.white : activeTheme.colors.textSecondary}
              />
              <Text style={[styles.tabPillText, active && styles.tabPillTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={activeTheme.colors.accent} style={styles.loader} />
      ) : tab === 'requests' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={activeTheme.colors.accent} />
          }
        >
          <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
          {requestsByCompetition.length === 0 ? (
            <Text style={styles.empty}>No pending requests</Text>
          ) : (
            requestsByCompetition.map(([compName, requests]) => (
              <View key={compName} style={styles.section}>
                <Text style={styles.sectionLabel}>Competition</Text>
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
                          <ActivityIndicator size="small" color={activeTheme.colors.black} />
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
      ) : tab === 'admins' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={activeTheme.colors.accent} />
          }
        >
          <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
          {adminRequests.length === 0 ? (
            <Text style={styles.empty}>No pending admin requests</Text>
          ) : (
            adminRequests.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardName}>{r.username || 'Unknown user'}</Text>
                <Text style={styles.cardDate}>{new Date(r.created_at).toLocaleString()}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.approveBtn, actingId === r.id && styles.buttonDisabled]}
                    onPress={() => handleApproveAdmin(r.id)}
                    disabled={actingId !== null}
                  >
                    {actingId === r.id ? (
                      <ActivityIndicator size="small" color={activeTheme.colors.black} />
                    ) : (
                      <Text style={styles.approveBtnText}>Grant admin</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectBtn, actingId === r.id && styles.buttonDisabled]}
                    onPress={() => handleRejectAdmin(r.id)}
                    disabled={actingId !== null}
                  >
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : tab === 'create' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.formContent}>
          <View style={styles.formPanel}>
            <Text style={styles.formPanelTitle}>Create competition</Text>
            <Text style={styles.formPanelHint}>Festival dates and course; optional 6-character access code.</Text>
          <Text style={styles.formLabel}>Competition name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Pat Nutter 2027"
            placeholderTextColor={activeTheme.colors.textMuted}
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
                fontFamily: activeTheme.fontFamily.input,
                fontSize: 16,
                color: activeTheme.colors.text,
                backgroundColor: activeTheme.colors.surface,
                border: `1px solid ${activeTheme.colors.border}`,
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
              <Text style={[styles.coursePickerTriggerText, !newStartDate && { color: activeTheme.colors.textMuted }]}>
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
                fontFamily: activeTheme.fontFamily.input,
                fontSize: 16,
                color: activeTheme.colors.text,
                backgroundColor: activeTheme.colors.surface,
                border: `1px solid ${activeTheme.colors.border}`,
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
              <Text style={[styles.coursePickerTriggerText, !newEndDate && { color: activeTheme.colors.textMuted }]}>
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
            <Text style={[styles.coursePickerTriggerText, !newCourse && { color: activeTheme.colors.textMuted }]}>
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
                  placeholderTextColor={activeTheme.colors.textMuted}
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
            placeholderTextColor={activeTheme.colors.textMuted}
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
              <ActivityIndicator color={activeTheme.colors.black} />
            ) : (
              <Text style={styles.createButtonText}>Create competition</Text>
            )}
          </TouchableOpacity>
          </View>
        </ScrollView>
      ) : tab === 'competitionList' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={activeTheme.colors.accent} />
          }
        >
          <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
          <View style={styles.catalogIntro}>
            <Text style={styles.catalogIntroTitle}>Competitions & join codes</Text>
            <Text style={styles.catalogIntroHint}>
              Competitions you created appear here. Older rows without a creator are shown to every admin. Use the join code (access code) for entrants.
            </Text>
          </View>
          <View style={styles.compTabsRow}>
            {(['complete', 'live', 'upcoming'] as const).map((filterKey) => {
              const isActive = compListFilter === filterKey;
              const label = filterKey === 'complete' ? 'Complete' : filterKey === 'live' ? 'Live' : 'Upcoming';
              return (
                <TouchableOpacity
                  key={filterKey}
                  style={[styles.compTab, isActive && styles.compTabActive]}
                  onPress={() => setCompListFilter(filterKey)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.compTabText, isActive && styles.compTabTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {adminCompetitionsFiltered.length === 0 ? (
            <Text style={styles.empty}>No competitions in this category.</Text>
          ) : (
            adminCompetitionsFiltered.map((c) => (
              <View key={c.id} style={styles.catalogCard}>
                <View style={styles.catalogCardTop}>
                  <Text style={styles.catalogName} numberOfLines={2}>
                    {c.name}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      c.display_status === 'live' && styles.statusPillLive,
                      c.display_status === 'upcoming' && styles.statusPillUpcoming,
                      c.display_status === 'complete' && styles.statusPillComplete,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        c.display_status === 'live' && { color: activeTheme.colors.accent },
                        c.display_status === 'upcoming' && { color: activeTheme.colors.barAccent },
                        c.display_status === 'complete' && { color: activeTheme.colors.textMuted },
                      ]}
                    >
                      {c.display_status === 'live' ? 'Live' : c.display_status === 'upcoming' ? 'Upcoming' : 'Complete'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.catalogMeta}>
                  {new Date(c.festival_start_date).toLocaleDateString()} –{' '}
                  {new Date(c.festival_end_date).toLocaleDateString()}
                </Text>
                <View style={styles.catalogFieldRow}>
                  <Text style={styles.catalogFieldLabel}>Join code</Text>
                  <Text style={styles.catalogCode}>{c.access_code ?? '—'}</Text>
                </View>
                <View style={styles.catalogFieldRow}>
                  <Text style={styles.catalogFieldLabel}>Created by</Text>
                  <Text style={styles.catalogCreator}>
                    {c.creator_username ??
                      (c.created_by_user_id ? `${c.created_by_user_id.slice(0, 8)}…` : '— (legacy)')}
                  </Text>
                </View>
              </View>
            ))
          )}
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
      </>
      )}
    </SafeAreaView>
  );
}

function createAdminStyles(t: Theme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.background },
  adminChrome: {
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.lg,
    backgroundColor: t.colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  adminChromeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.spacing.md,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.barAccent,
  },
  adminBadgeText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: t.colors.barAccent,
    textTransform: 'uppercase',
  },
  exitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  exitPillText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.textSecondary,
  },
  title: {
    fontFamily: t.fontFamily.regular,
    fontSize: 22,
    fontWeight: '700',
    color: t.colors.text,
    marginBottom: t.spacing.xs,
    letterSpacing: -0.3,
  },
  adminSubTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    color: t.colors.textMuted,
    lineHeight: 19,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
  },
  backButtonText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.accent,
    textDecorationLine: 'underline',
  },
  tabScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
    maxHeight: 56,
  },
  tabScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.sm,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  tabPillActive: {
    backgroundColor: t.colors.barAccent,
    borderColor: t.colors.barAccent,
  },
  tabPillText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    fontWeight: '600',
    color: t.colors.textSecondary,
    maxWidth: 140,
  },
  tabPillTextActive: {
    color: t.colors.white,
  },
  loader: { marginTop: t.spacing.xl },
  scroll: { flex: 1 },
  scrollContent: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl },
  formContent: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl },
  formPanel: {
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.lg,
    marginBottom: t.spacing.md,
  },
  formPanelTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 17,
    fontWeight: '700',
    color: t.colors.text,
    marginBottom: t.spacing.xs,
  },
  formPanelHint: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    marginBottom: t.spacing.md,
    lineHeight: 17,
  },
  catalogIntro: {
    marginBottom: t.spacing.lg,
    padding: t.spacing.md,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.barAccent,
  },
  catalogIntroTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    fontWeight: '700',
    color: t.colors.text,
    marginBottom: t.spacing.xs,
  },
  catalogIntroHint: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 17,
  },
  compTabsRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: t.spacing.md,
    gap: t.spacing.xs,
  },
  compTab: {
    flex: 1,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.xs,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compTabActive: {
    backgroundColor: t.colors.accent,
  },
  compTabText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  compTabTextActive: {
    color: t.colors.white,
    fontWeight: '600',
  },
  catalogCard: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.barAccent,
  },
  catalogCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
    marginBottom: t.spacing.xs,
  },
  catalogName: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.text,
    flex: 1,
  },
  catalogMeta: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    marginBottom: t.spacing.sm,
  },
  catalogFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.md,
    paddingVertical: t.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  catalogFieldLabel: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  catalogCode: {
    fontFamily: t.fontFamily.input,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: t.colors.accent,
  },
  catalogCreator: {
    fontFamily: t.fontFamily.input,
    fontSize: 13,
    color: t.colors.text,
    flex: 1,
    textAlign: 'right',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: t.radius.full,
    borderWidth: 1,
  },
  statusPillText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 11,
    fontWeight: '700',
  },
  statusPillLive: {
    backgroundColor: t.colors.accentMuted,
    borderColor: t.colors.accent,
  },
  statusPillUpcoming: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.barAccent,
  },
  statusPillComplete: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
  },
  formLabel: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.textSecondary,
    marginBottom: t.spacing.xs,
    marginTop: t.spacing.md,
  },
  input: {
    fontFamily: t.fontFamily.input,
    fontSize: 16,
    color: t.colors.text,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  coursePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coursePickerTriggerText: {
    fontFamily: t.fontFamily.input,
    fontSize: 16,
    color: t.colors.text,
  },
  coursePickerChevron: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: t.spacing.lg,
  },
  modalContent: {
    backgroundColor: t.colors.background,
    borderRadius: t.radius.md,
    maxHeight: '70%',
  },
  datePickerModalContent: {
    backgroundColor: t.colors.background,
    borderRadius: t.radius.md,
    marginHorizontal: t.spacing.lg,
  },
  datePickerActions: { flexDirection: 'row' },
  pullToRefreshHint: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    textAlign: 'center',
    marginBottom: t.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: t.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  modalTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 18,
    color: t.colors.text,
  },
  modalClose: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.barAccent,
    fontWeight: '600',
  },
  courseSearchInput: {
    fontFamily: t.fontFamily.input,
    fontSize: 16,
    color: t.colors.text,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    marginHorizontal: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  courseFilterRow: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  courseFilterChip: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  courseFilterChipActive: { backgroundColor: t.colors.accentMuted, borderColor: t.colors.accent },
  courseFilterChipText: { fontFamily: t.fontFamily.regular, fontSize: 14, color: t.colors.textSecondary },
  courseFilterChipTextActive: { color: t.colors.accent, fontWeight: '600' },
  courseList: { maxHeight: 400 },
  courseListEmpty: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: 'center',
    padding: t.spacing.lg,
  },
  courseItem: {
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  courseItemActive: { backgroundColor: t.colors.accentMuted },
  courseItemText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.text,
  },
  courseItemTextActive: { color: t.colors.accent, fontWeight: '600' },
  createButton: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    alignItems: 'center',
    marginTop: t.spacing.xl,
  },
  createButtonText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.black,
    fontWeight: '600',
  },
  empty: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: 'center',
    marginTop: t.spacing.xl,
  },
  section: { marginBottom: t.spacing.xl },
  sectionLabel: {
    fontFamily: t.fontFamily.regular,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: t.colors.textMuted,
    marginBottom: t.spacing.xs,
  },
  sectionTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 17,
    fontWeight: '600',
    color: t.colors.text,
    marginBottom: t.spacing.md,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.barAccent,
  },
  cardName: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.text,
  },
  cardDate: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: t.spacing.xs,
  },
  editHint: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.accent,
    marginTop: t.spacing.xs,
  },
  actions: { flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.sm },
  approveBtn: {
    flex: 1,
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.sm,
    paddingVertical: t.spacing.sm,
    alignItems: 'center',
  },
  approveBtnText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.black,
    fontWeight: '600',
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.sm,
    paddingVertical: t.spacing.sm,
    alignItems: 'center',
  },
  rejectBtnText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.text,
  },
  buttonDisabled: { opacity: 0.7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: t.spacing.md, gap: t.spacing.sm },
  chipRowScroll: { flexDirection: 'row', marginBottom: t.spacing.md, gap: t.spacing.sm },
  chip: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  chipActive: { backgroundColor: t.colors.accentMuted, borderColor: t.colors.accent },
  chipText: { fontFamily: t.fontFamily.regular, fontSize: 14, color: t.colors.textSecondary },
  chipTextActive: { color: t.colors.accent },
  editSelectionsIntro: {
    marginBottom: t.spacing.xl,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.barAccent,
  },
  editSelectionsTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.text,
    fontWeight: '600',
    marginBottom: t.spacing.xs,
  },
  editSelectionsHint: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 20,
  },
  stepLabel: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.textSecondary,
    fontWeight: '600',
    marginBottom: t.spacing.sm,
    marginTop: t.spacing.md,
  },
  emptyCard: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    padding: t.spacing.lg,
    marginBottom: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  emptyTitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 15,
    color: t.colors.text,
    fontWeight: '600',
    marginBottom: t.spacing.xs,
  },
  emptyDetail: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    color: t.colors.textMuted,
    lineHeight: 19,
  },
  selectionCard: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.accent,
  },
  selectionCardName: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.text,
    fontWeight: '600',
  },
  selectionCardMeta: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    color: t.colors.textMuted,
    marginTop: t.spacing.xs,
  },
  selectionCardEdit: {
    fontFamily: t.fontFamily.regular,
    fontSize: 13,
    color: t.colors.accent,
    marginTop: t.spacing.xs,
  },
  });
}

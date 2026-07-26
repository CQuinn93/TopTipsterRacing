import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateTabletCode } from '@/lib/tabletCode';
import { adminAlert, isProfileAdmin } from '@/lib/adminSession';
import { supabase } from '@/lib/supabase';

/**
 * Shared sport menu (hamburger).
 * Racing / LMS: Return to Home (+ LMS Rules / How it works)
 * Admins: Admin tools (Racing + Football) and access code
 * Non-admins: Request admin access
 */
export function AppSidebar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open, closeSidebar, variant } = useSidebar();
  const { userId } = useAuth();

  const [role, setRole] = useState<'User' | 'Admin'>('User');
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [adminRequestPending, setAdminRequestPending] = useState(false);
  const [adminRequestLoading, setAdminRequestLoading] = useState(false);
  const [openingAdmin, setOpeningAdmin] = useState<'racing' | 'football' | null>(null);

  useEffect(() => {
    if (!userId || !open) return;
    let cancelled = false;
    void (async () => {
      try {
        const db = supabase as any;
        const [{ data: req }, admin] = await Promise.all([
          db
            .from('admin_access_requests')
            .select('status')
            .eq('user_id', userId)
            .maybeSingle(),
          isProfileAdmin(userId),
        ]);
        if (cancelled) return;
        setRole(admin ? 'Admin' : 'User');
        setAdminRequestPending((req as { status?: string } | null)?.status === 'pending');
        if (admin) {
          const code = await getOrCreateTabletCode(userId).catch(() => null);
          if (!cancelled) setAccessCode(code);
        } else {
          setAccessCode(null);
        }
      } catch {
        if (!cancelled) {
          setRole('User');
          setAccessCode(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, open]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          flexDirection: 'row',
          justifyContent: 'flex-start',
        },
        panel: {
          width: '78%',
          maxWidth: 320,
          height: '100%',
          backgroundColor: theme.colors.surface,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: theme.colors.border,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        headerTitle: {
          fontFamily:
            variant === 'lms' ? theme.fontFamily.baiBold : theme.fontFamily.regular,
          fontSize: 18,
          color: theme.colors.text,
          fontWeight: '700',
        },
        closeBtn: { padding: 4 },
        buttons: {
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          gap: 4,
          paddingBottom: theme.spacing.xl,
        },
        menuButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: 14,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.md,
        },
        menuButtonText: {
          flex: 1,
          fontFamily:
            variant === 'lms' ? theme.fontFamily.baiMedium : theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
          fontWeight: '600',
        },
        sectionLabel: {
          fontFamily:
            variant === 'lms' ? theme.fontFamily.baiSemiBold : theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xs,
        },
        footer: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          gap: theme.spacing.sm,
        },
        adminBadge: {
          alignSelf: 'flex-start',
          backgroundColor: theme.colors.accentMuted,
          borderRadius: theme.radius.sm,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        adminBadgeText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.accent,
        },
        footerCodeLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        footerCodeValue: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          letterSpacing: 4,
          color: theme.colors.accent,
          fontWeight: '700',
        },
      }),
    [theme, variant]
  );

  const goTo = (path: string) => {
    closeSidebar();
    router.push(path as any);
  };

  const returnTo = variant === 'lms' ? '/(lms)' : '/(app)';

  const openAdminPanel = async (sport: 'racing' | 'football') => {
    if (!userId || role !== 'Admin') {
      adminAlert('Admin tools unavailable', 'Admin access is required.');
      return;
    }
    setOpeningAdmin(sport);
    try {
      const code = accessCode ?? (await getOrCreateTabletCode(userId));
      setAccessCode(code);
      closeSidebar();
      router.push({
        pathname: sport === 'football' ? '/(auth)/admin-lms' : '/(auth)/admin',
        params: { code, returnTo },
      } as any);
    } catch (e) {
      adminAlert(
        'Admin tools unavailable',
        e instanceof Error ? e.message : 'Could not open admin tools. Try again in a moment.'
      );
    } finally {
      setOpeningAdmin(null);
    }
  };

  const handleRequestAdmin = async () => {
    if (!userId || role === 'Admin') return;
    setAdminRequestLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_request_access');
      if (error) throw error;
      const result = data as { success?: boolean; status?: string; error?: string } | null;
      if (!result?.success) {
        adminAlert('Error', result?.error ?? 'Could not send admin request.');
        return;
      }
      if (result.status === 'already_admin') {
        setRole('Admin');
        adminAlert('Already admin', 'Your account already has admin access.');
        return;
      }
      setAdminRequestPending(true);
      adminAlert('Request sent', 'Your admin access request has been sent for approval.');
    } catch (e: unknown) {
      adminAlert('Error', e instanceof Error ? e.message : 'Could not request admin access.');
    } finally {
      setAdminRequestLoading(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeSidebar}>
      <Pressable style={styles.backdrop} onPress={closeSidebar}>
        <Pressable
          style={[styles.panel, { paddingTop: insets.top }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Menu</Text>
            <TouchableOpacity onPress={closeSidebar} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.buttons}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/competition-hub')}
              activeOpacity={0.7}
            >
              <Ionicons name="home-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Return to Home</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {variant === 'lms' ? (
              <>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(lms)/rules')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Rules</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(lms)/how-it-works')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="help-circle-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>How it works</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(app)/rules')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Rules</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(app)/points')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="stats-chart-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Points system</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(app)/reminders')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="notifications-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Reminders</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </>
            )}

            {role === 'Admin' ? (
              <>
                <Text style={styles.sectionLabel}>Admin</Text>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => void openAdminPanel('racing')}
                  disabled={openingAdmin !== null}
                  activeOpacity={0.7}
                >
                  <Ionicons name="construct-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Racing admin</Text>
                  {openingAdmin === 'racing' ? (
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => void openAdminPanel('football')}
                  disabled={openingAdmin !== null}
                  activeOpacity={0.7}
                >
                  <Ionicons name="football-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Football admin</Text>
                  {openingAdmin === 'football' ? (
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/competition-hub?tab=admin')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="grid-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Admin home</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={() => void handleRequestAdmin()}
                disabled={adminRequestLoading || adminRequestPending}
                activeOpacity={0.7}
              >
                <Ionicons name="shield-outline" size={22} color={theme.colors.accent} />
                {adminRequestLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Text
                    style={[
                      styles.menuButtonText,
                      adminRequestPending ? { color: theme.colors.textMuted } : null,
                    ]}
                  >
                    {adminRequestPending ? 'Admin request pending' : 'Request admin access'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>

          {role === 'Admin' ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(theme.spacing.lg, insets.bottom) },
              ]}
            >
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
              {accessCode ? (
                <View>
                  <Text style={styles.footerCodeLabel}>Your access code</Text>
                  <Text style={styles.footerCodeValue}>{accessCode}</Text>
                  <Text style={styles.footerCodeLabel}>
                    Use this code for Quick access and admin tools.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : Platform.OS === 'web' ? (
            <View style={{ height: Math.max(theme.spacing.md, insets.bottom) }} />
          ) : (
            <View style={{ height: Math.max(theme.spacing.md, insets.bottom) }} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

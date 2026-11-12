import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import type {
  OrganizationMemberRow,
  OrganizationRole,
  OrganizationRow,
  ProfileRow,
  UserOrganizationMembership,
} from "../../types/database";

export interface SignInResult {
  error: AuthError | Error | null;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  memberships: UserOrganizationMembership[];
  organizations: OrganizationRow[];
  activeMembership: UserOrganizationMembership | null;
  activeOrganization: OrganizationRow | null;
  activeRole: OrganizationRole | null;
  loading: boolean;
  contextLoading: boolean;
  contextError: string | null;
  isConfigured: boolean;
  selectOrganization: (organizationId: string) => void;
  refreshUserContext: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<SignInResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [memberships, setMemberships] = useState<UserOrganizationMembership[]>(
    [],
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);
  const [contextLoading, setContextLoading] = useState<boolean>(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const activeRequestIdRef = useRef<number>(0);
  const loadedUserIdRef = useRef<string | null>(null);

  const clearDirectoryState = useCallback(() => {
    activeRequestIdRef.current += 1;
    loadedUserIdRef.current = null;
    setProfile(null);
    setMemberships([]);
    setSelectedOrganizationId(null);
    setContextLoading(false);
    setContextError(null);
  }, []);

  const fetchUserDirectoryContext = useCallback(
    async (userId: string, force = false) => {
      const client = supabase;
      if (!client) {
        return;
      }

      if (!force && loadedUserIdRef.current === userId) {
        return;
      }

      // H-01: Si cambia el usuario autenticado (incluso sin signOut explícito previo),
      // purgar inmediatamente el contexto en memoria del usuario anterior:
      if (
        loadedUserIdRef.current !== null &&
        loadedUserIdRef.current !== userId
      ) {
        setProfile(null);
        setMemberships([]);
        setSelectedOrganizationId(null);
      }

      const requestId = ++activeRequestIdRef.current;
      loadedUserIdRef.current = userId;
      setContextLoading(true);
      setContextError(null);

      try {
        const [profileResponse, membersResponse] = await Promise.all([
          client
            .from("profiles")
            .select("id, display_name, avatar_path, created_at, updated_at")
            .eq("id", userId)
            .maybeSingle(),
          client
            .from("organization_members")
            .select(
              "id, organization_id, user_id, role, membership_type, status, created_at, updated_at",
            )
            .eq("user_id", userId)
            .eq("status", "active")
            .order("created_at", { ascending: true }),
        ]);

        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        if (profileResponse.error) {
          throw profileResponse.error;
        }

        if (membersResponse.error) {
          throw membersResponse.error;
        }

        const fetchedProfile = (profileResponse.data ?? null) as ProfileRow | null;
        const memberRows = (membersResponse.data ?? []) as OrganizationMemberRow[];

        let combinedMemberships: UserOrganizationMembership[] = [];

        if (memberRows.length > 0) {
          const organizationIds = Array.from(
            new Set(memberRows.map((row) => row.organization_id)),
          );

          const organizationsResponse = await client
            .from("organizations")
            .select(
              "id, name, slug, status, created_at, updated_at, archived_at",
            )
            .in("id", organizationIds)
            .eq("status", "active")
            .is("archived_at", null)
            .order("name", { ascending: true });

          if (activeRequestIdRef.current !== requestId) {
            return;
          }

          if (organizationsResponse.error) {
            throw organizationsResponse.error;
          }

          const orgRows = (organizationsResponse.data ?? []) as OrganizationRow[];
          const orgMap = new Map<string, OrganizationRow>(
            orgRows.map((org) => [org.id, org]),
          );

          combinedMemberships = memberRows
            .map((member) => {
              const organization = orgMap.get(member.organization_id);
              if (!organization) {
                return null;
              }
              return {
                ...member,
                organization,
              };
            })
            .filter(
              (item): item is UserOrganizationMembership => item !== null,
            );
        }

        setProfile(fetchedProfile);
        setMemberships(combinedMemberships);

        setSelectedOrganizationId((previousOrgId) => {
          if (combinedMemberships.length === 1) {
            return combinedMemberships[0].organization_id;
          }
          if (
            previousOrgId &&
            combinedMemberships.some(
              (item) => item.organization_id === previousOrgId,
            )
          ) {
            return previousOrgId;
          }
          // Si existen 0 o múltiples organizaciones y el usuario no ha elegido
          // una explícitamente, no se selecciona ninguna automáticamente.
          return null;
        });
      } catch {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        loadedUserIdRef.current = null;
        setProfile(null);
        setMemberships([]);
        setSelectedOrganizationId(null);
        setContextError(
          "No fue posible recuperar el perfil o las organizaciones asociadas.",
        );
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setContextLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    let isMounted = true;
    let authEventReceived = false;

    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      setLoading(false);

      const nextUserId = nextSession?.user?.id ?? null;
      if (nextUserId) {
        void fetchUserDirectoryContext(nextUserId, false);
      } else {
        clearDirectoryState();
      }
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }
      authEventReceived = true;
      applySession(nextSession);
    });

    void client.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) {
          return;
        }
        if (!authEventReceived) {
          applySession(data.session ?? null);
        }
      })
      .catch(() => {
        if (isMounted && !authEventReceived) {
          applySession(null);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearDirectoryState, fetchUserDirectoryContext]);

  const selectOrganization = useCallback(
    (organizationId: string) => {
      setSelectedOrganizationId((previous) => {
        const exists = memberships.some(
          (item) => item.organization_id === organizationId,
        );
        return exists ? organizationId : previous;
      });
    },
    [memberships],
  );

  const refreshUserContext = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }
    await fetchUserDirectoryContext(userId, true);
  }, [session?.user?.id, fetchUserDirectoryContext]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (!supabase) {
        return {
          error: new Error(
            "El cliente de Supabase no está configurado. Verifica VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
          ),
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!error && data.session) {
        setSession(data.session);
        void fetchUserDirectoryContext(data.session.user.id, false);
      }

      return { error };
    },
    [fetchUserDirectoryContext],
  );

  const signOut = useCallback(async (): Promise<SignInResult> => {
    clearDirectoryState();

    if (!supabase) {
      setSession(null);
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
      setSession(null);
      return { error };
    } catch (err) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setSession(null);
      return {
        error:
          err instanceof Error
            ? err
            : new Error("Error al cerrar la sesión activa."),
      };
    }
  }, [clearDirectoryState]);

  const organizations = useMemo<OrganizationRow[]>(
    () => memberships.map((item) => item.organization),
    [memberships],
  );

  const activeMembership = useMemo<UserOrganizationMembership | null>(() => {
    if (!selectedOrganizationId) {
      return null;
    }
    return (
      memberships.find(
        (item) => item.organization_id === selectedOrganizationId,
      ) ?? null
    );
  }, [memberships, selectedOrganizationId]);

  const activeOrganization = activeMembership?.organization ?? null;
  const activeRole = activeMembership?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      organizations,
      activeMembership,
      activeOrganization,
      activeRole,
      loading,
      contextLoading,
      contextError,
      isConfigured: isSupabaseConfigured,
      selectOrganization,
      refreshUserContext,
      signInWithPassword,
      signOut,
    }),
    [
      session,
      profile,
      memberships,
      organizations,
      activeMembership,
      activeOrganization,
      activeRole,
      loading,
      contextLoading,
      contextError,
      selectOrganization,
      refreshUserContext,
      signInWithPassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de un AuthProvider.");
  }
  return context;
}

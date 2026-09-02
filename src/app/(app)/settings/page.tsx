import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import {
  CoupleForm,
  PasswordForm,
  ProfileForm,
} from "@/components/settings/SettingsForms";
import { NotificationTypes } from "@/components/settings/NotificationTypes";
import { PushSettings } from "@/components/settings/PushSettings";
import { ThemeSwitcher } from "@/components/settings/ThemeSwitcher";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  asProfile,
  asSettings,
  profileQuery,
  requireSession,
  settingsQuery,
} from "@/lib/data/couple";
import type { NotificationSettings } from "@/types/database";

import { signOut } from "./actions";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const { supabase, user } = await requireSession();

  const [profileResult, settingsResult, notifyResult, subsResult] =
    await Promise.all([
      profileQuery(supabase, user.id),
      settingsQuery(supabase),
      supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("push_subscriptions").select("endpoint"),
    ]);

  const profile = asProfile(profileResult);
  const settings = asSettings(settingsResult);
  const notifySettings = notifyResult.data as NotificationSettings | null;
  const hasSubscription =
    ((subsResult.data as Array<{ endpoint: string }> | null) ?? []).length > 0;

  return (
    <div>
      <PageHeader title="Настройки" subtitle={user.email ?? undefined} />

      <div className="space-y-4 px-5">
        <Section title="Профиль">
          <ProfileForm displayName={profile?.display_name ?? ""} />
        </Section>

        <Section title="Наши настройки">
          <CoupleForm
            appName={settings.app_name}
            relationshipStart={settings.relationship_start}
          />
        </Section>

        <Section title="Уведомления">
          <div className="space-y-5">
            <PushSettings
              vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
              enabledHere={hasSubscription}
            />

            {hasSubscription && (
              <div className="border-t border-border pt-4">
                <NotificationTypes settings={notifySettings} />
              </div>
            )}
          </div>
        </Section>

        <Section title="Оформление">
          <ThemeSwitcher />
        </Section>

        <Section title="Безопасность">
          <PasswordForm />
        </Section>

        <form action={signOut} className="pt-2">
          <Button type="submit" variant="danger" block>
            Выйти из аккаунта
          </Button>
        </form>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-[13px] tracking-wide text-text-faint uppercase">
        {title}
      </h2>
      {children}
    </Card>
  );
}

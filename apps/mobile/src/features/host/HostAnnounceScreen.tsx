/**
 * HostAnnounce (`/host/[programId]/announce?session=<id>`, HostAnnounce.png, PRD §13): SAY IT ONCE.
 * Pick who gets it (live count from the server), start from a template, write the message, see how
 * the pinned line looks in the session chat, pin / notify, SEND TO n; then SENT BEFORE with read
 * counts and the session chat. Calm.
 *
 * An announcement is always about one session (contract): the one in `?session=`, else the next one
 * that hasn't ended. Hosts get 2 pushes per session (logistics only); the server enforces it.
 */
import {
  HOST_ANNOUNCEMENT_MAX_LENGTH,
  HOST_PUSHES_PER_SESSION,
  type HostAudience,
} from '@ojoro/contracts';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Chip,
  DisplayText,
  Divider,
  Icon,
  IconButton,
  Input,
  Screen,
  Strip,
  Switch,
  Text,
  useThemeColor,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { goBack, InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import { useHostWeek, useProgram } from './data';
import {
  useAnnounceContext,
  useAnnouncementHistory,
  useAnnounceTemplates,
  useRecipientCount,
  useSendAnnouncement,
} from './moneyData';
import {
  AUDIENCES,
  audienceLabel,
  characterCount,
  chatNewLine,
  historyMeta,
  messageError,
  notifyDescription,
  pickAnnounceSession,
  pinnedOverline,
  previewWhen,
  readCount,
  sendLabel,
  toggleAudience,
} from './peopleLogic';

export function HostAnnounceScreen({ programId }: { programId: string }) {
  const params = useLocalSearchParams<{ session?: string }>();
  const online = useOnline();
  const program = useProgram(programId);
  const week = useHostWeek(programId, !params.session);
  const sessionId = useMemo(
    () => pickAnnounceSession(week.data ?? [], new Date(), params.session ?? null),
    [week.data, params.session],
  );
  const timeZone = program.data?.time_zone ?? 'America/Toronto';
  const home = `/host/${programId}` as Href;

  useEffect(() => {
    track('screen_viewed', { screen: 'host_announce', program_id: programId });
  }, [programId]);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline="ANNOUNCEMENT"
        fallback={home}
        right={<IconButton icon="close" label="Discard" onPress={() => goBack(home)} testID="host-announce-discard" />}
      />
      <View className="gap-space-9 px-space-5 pb-space-10 pt-space-4" testID="host-announce">
        {!online ? <OfflineNote dataUpdatedAt={program.dataUpdatedAt} extra="Sending waits until you're back." /> : null}
        <View className="gap-space-3" role="region" aria-label="Say it once">
          <DisplayText size="lg" accessibilityRole="header">
            SAY IT ONCE.
          </DisplayText>
          <Text variant="body">
            One message to everyone you pick. It's pinned to the top of the session chat, so nobody has to scroll for it.
          </Text>
        </View>

        {sessionId ? (
          <Composer key={sessionId} programId={programId} sessionId={sessionId} timeZone={timeZone} online={online} />
        ) : week.isPending ? (
          <LoadingState label="Loading your sessions" kinds={['text', 'strip']} />
        ) : week.isError ? (
          <InlineError message={errorMessage(ojoroErrorOf(week.error))} action="RETRY" onAction={() => void week.refetch()} />
        ) : (
          <View className="gap-space-3" testID="host-announce-no-session">
            <Text variant="title">No session coming up.</Text>
            <Text variant="body-sm" muted>
              An announcement is pinned in one session's chat. Once a session is on the schedule, you can send one here.
            </Text>
          </View>
        )}

        <History programId={programId} sessionId={sessionId} timeZone={timeZone} />
      </View>
    </Screen>
  );
}

function Composer({
  programId,
  sessionId,
  timeZone,
  online,
}: {
  programId: string;
  sessionId: string;
  timeZone: string;
  online: boolean;
}) {
  const toast = useToast();
  const context = useAnnounceContext(programId, sessionId);
  const templates = useAnnounceTemplates(programId, sessionId);
  const ctx = context.data ?? null;
  const [audiences, setAudiences] = useState<HostAudience[] | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);
  const [pin, setPin] = useState(true);
  const [notify, setNotify] = useState<boolean | null>(null);
  const send = useSendAnnouncement(programId, sessionId);

  // Defaults once the session is known: the people in and the waitlist; a notification while one is left.
  useEffect(() => {
    if (!ctx) return;
    setAudiences((a) => a ?? (ctx.waitlist_count > 0 ? ['session', 'waitlist'] : ['session']));
    setNotify((n) => n ?? ctx.pushes_left > 0);
  }, [ctx]);
  // Start from the first template, as designed, until the host writes their own.
  useEffect(() => {
    const first = templates.data?.[0];
    if (first && !touched && !body) {
      setTemplate(first.key);
      setBody(first.body);
    }
  }, [templates.data, touched, body]);

  const picked = audiences ?? [];
  const count = useRecipientCount(programId, sessionId, picked);
  const recipients = picked.length === 0 ? 0 : (count.data ?? null);
  const max = ctx?.max_length ?? HOST_ANNOUNCEMENT_MAX_LENGTH;
  const bodyError = messageError(body, max);
  const pushesLeft = ctx?.pushes_left ?? HOST_PUSHES_PER_SESSION;
  const notifyOn = !!notify && pushesLeft > 0;
  const now = new Date();

  if (context.isPending) return <LoadingState label="Loading the session" kinds={['text', 'text', 'object']} />;
  if (!ctx) {
    return (
      <InlineError
        message={context.error ? errorMessage(ojoroErrorOf(context.error)) : "We can't find that session."}
        action="RETRY"
        onAction={() => void context.refetch()}
        testID="host-announce-error"
      />
    );
  }

  const disabled = picked.length === 0 || recipients === 0 || !!bodyError || send.isPending;

  return (
    <>
      <View className="gap-space-3" role="region" aria-label="To">
        <Text variant="label">TO</Text>
        <View className="flex-row flex-wrap gap-space-2" role="group" aria-label="Recipients">
          {AUDIENCES.map((a) => (
            <Chip
              key={a}
              selected={picked.includes(a)}
              onPress={() => setAudiences(toggleAudience(picked, a))}
              testID={`host-announce-to-${a}`}
            >
              {audienceLabel(a, ctx, ctx.starts_at, now, timeZone)}
            </Chip>
          ))}
        </View>
      </View>

      <View className="gap-space-3" role="region" aria-label="Message">
        {(templates.data ?? []).length > 0 ? (
          <>
            <Text variant="label">START FROM</Text>
            <View className="flex-row flex-wrap gap-space-2" role="radiogroup" aria-label="Templates">
              {(templates.data ?? []).map((t) => (
                <Chip
                  key={t.key}
                  selected={template === t.key}
                  onPress={() => {
                    setTemplate(t.key);
                    setBody(t.body);
                    setTouched(true);
                  }}
                  testID={`host-announce-template-${t.key}`}
                >
                  {t.label}
                </Chip>
              ))}
            </View>
          </>
        ) : null}
        <Input
          label="Message"
          multiline
          value={body}
          onChangeText={(t) => {
            setBody(t);
            setTouched(true);
            setTemplate(null);
          }}
          hint={characterCount(body, max)}
          error={touched && bodyError ? `${bodyError} ${characterCount(body, max)}` : undefined}
          testID="host-announce-message"
        />
      </View>

      <View className="gap-space-3" role="region" aria-label="Preview">
        <Text variant="label">HOW IT LOOKS IN THE CHAT</Text>
        <Preview author={ctx.author_name} pinned={pin} body={body} when={previewWhen(ctx.session_name, ctx.starts_at, now, timeZone)} />
      </View>

      <View role="region" aria-label="Delivery">
        <View className="border-b border-line py-space-4">
          <Switch
            value={pin}
            onValueChange={setPin}
            label="Pin to the session chat"
            description="Stays at the top until the session ends."
          />
        </View>
        <View className="border-b border-line py-space-4">
          <Switch
            value={notifyOn}
            onValueChange={setNotify}
            disabled={pushesLeft <= 0}
            label="Send as a notification"
            description={notifyDescription(pushesLeft, HOST_PUSHES_PER_SESSION)}
          />
        </View>
        <View className="mt-space-6 gap-space-3">
          <Button
            variant="primary"
            block
            disabled={disabled}
            loading={send.isPending}
            onPress={() => {
              setTouched(true);
              if (bodyError) return;
              send.mutate(
                { audiences: picked, body: body.trim(), template, pin, notify: notifyOn },
                {
                  onSuccess: (state) => {
                    const n = state.recipient_count ?? recipients ?? 0;
                    toast.show({
                      kind: 'success',
                      message: `Sent to ${n}.${state.pinned ? ' Pinned in the session chat.' : ''}${state.notified ? ' They get a notification.' : ''}`,
                    });
                    setBody('');
                    setTemplate(null);
                    setTouched(false);
                  },
                },
              );
            }}
            testID="host-announce-send"
          >
            {sendLabel(recipients, picked.length)}
          </Button>
          {send.isError ? (
            <InlineError message={errorMessage(ojoroErrorOf(send.error))} testID="host-announce-send-error" />
          ) : null}
          {!online ? (
            <Text variant="caption" muted>
              Offline. It sends when you're back, once.
            </Text>
          ) : null}
        </View>
      </View>

    </>
  );
}

/** The pinned line as the chat shows it: inverse ground, pin, who it's from, the words, the session. */
function Preview({ author, pinned, body, when }: { author: string; pinned: boolean; body: string; when: string }) {
  return (
    <View className="gap-space-3 bg-inverse p-space-5" accessible accessibilityLabel={`Preview. ${pinnedOverline(author, pinned)}. ${body || 'No message yet'}. ${when}`} testID="host-announce-preview">
      <View className="flex-row items-center gap-space-2">
        {pinned ? <InverseIcon /> : null}
        <Text variant="overline" tone="on-inverse">
          {pinnedOverline(author, pinned)}
        </Text>
      </View>
      <Text variant="title" tone="on-inverse">
        {body.trim() || 'Your message shows here.'}
      </Text>
      <Text variant="caption" tone="on-inverse" style={{ opacity: 0.8 }}>
        {when}
      </Text>
    </View>
  );
}

function InverseIcon() {
  const onInverse = useThemeColor('on-inverse');
  return <Icon name="pin" size={16} color={onInverse} />;
}

function History({ programId, sessionId, timeZone }: { programId: string; sessionId: string | null; timeZone: string }) {
  const history = useAnnouncementHistory(programId);
  const ctx = useAnnounceContext(programId, sessionId).data ?? null;
  const rows = history.data ?? [];
  return (
    <View className="gap-space-1" role="region" aria-label="Sent before" testID="host-announce-history">
      <Divider label="SENT BEFORE" />
      {history.isPending ? (
        <LoadingState label="Loading past announcements" kinds={['strip', 'strip']} />
      ) : history.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(history.error))} action="RETRY" onAction={() => void history.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-3">
          Nothing sent yet. What you send shows here with how many read it.
        </Text>
      ) : (
        rows.map((r) => (
          <Strip
            key={r.announcement_id}
            title={r.body}
            titleVariant="title-sm"
            meta={historyMeta(r, r.time_zone ?? timeZone)}
            trailing={
              <Text variant="label-sm" style={{ fontVariant: ['tabular-nums'] }}>
                {readCount(r.read_count, r.recipient_count)}
              </Text>
            }
            trailingLabel={`${r.read_count} of ${r.recipient_count} read`}
            testID={`host-announce-past-${r.announcement_id}`}
          />
        ))
      )}
      {ctx ? (
        <Strip
          title="Open the session chat"
          titleVariant="title-sm"
          meta={chatNewLine(ctx.chat_new_today)}
          trailing={<Icon name="chat" />}
          onPress={() => router.push(`/activity/${ctx.activity_id}/chat` as Href)}
          accessibilityHint="Opens the session chat"
          testID="host-announce-chat"
        />
      ) : null}
    </View>
  );
}

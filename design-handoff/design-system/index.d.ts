import type * as React from 'react';

export type Situation = 'calm' | 'forming' | 'confirmed' | 'live' | 'after';
export interface Person { name: string; src?: string; isNew?: boolean }

/* Primitives */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'inverse' | 'commit'; committed?: boolean; block?: boolean }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface DisplayTextProps { as?: keyof JSX.IntrinsicElements; size?: 'hero' | 'xl' | 'lg' | 'md' | 'sm' | 'xs'; muted?: boolean; children?: React.ReactNode }
export declare function DisplayText(props: DisplayTextProps): React.ReactElement;
export interface AvatarProps { name?: string; src?: string; size?: 'sm' | 'md' | 'lg'; empty?: boolean }
export declare function Avatar(props: AvatarProps): React.ReactElement;
export interface BadgeProps { tone?: 'neutral' | 'signal' | 'verified'; children?: React.ReactNode }
export declare function Badge(props: BadgeProps): React.ReactElement;
export interface ChipProps { selected?: boolean; onClick?: () => void; children?: React.ReactNode }
export declare function Chip(props: ChipProps): React.ReactElement;
export interface ProgressProps { value: number; max?: number; label?: string }
export declare function Progress(props: ProgressProps): React.ReactElement;

/* Social */
export interface AvatarClusterProps { people: Person[]; total?: number; max?: number; open?: number; size?: 'sm' | 'md' }
export declare function AvatarCluster(props: AvatarClusterProps): React.ReactElement;
export interface LiveIndicatorProps { label?: string }
export declare function LiveIndicator(props: LiveIndicatorProps): React.ReactElement;
export interface CountdownProps { days?: number; hours?: number; minutes?: number; seconds?: number; label?: string }
export declare function Countdown(props: CountdownProps): React.ReactElement;
export interface PredictionSide { name: string; pct: number }
export interface PredictionBarProps { question?: string; a: PredictionSide; b: PredictionSide; picked?: 'a' | 'b' }
export declare function PredictionBar(props: PredictionBarProps): React.ReactElement;
export interface CrowdSupportProps { a: { name: string; count: number }; b: { name: string; count: number }; backing?: 'a' | 'b'; onBack?: (side: 'a' | 'b') => void }
export declare function CrowdSupport(props: CrowdSupportProps): React.ReactElement;
export interface MomentumMeterProps { weeks: number[]; streak?: number; label?: string }
export declare function MomentumMeter(props: MomentumMeterProps): React.ReactElement;

/* Movement */
export interface DownForProps { activity: string; when: string; where: string; downCount: number; downs?: Person[]; committed?: boolean; onDown?: () => void }
export declare function DownFor(props: DownForProps): React.ReactElement;
export interface PlanFormingProps { activity: string; count: number; capacity: number; participants?: Person[]; time: string; place: string; privacy?: 'open' | 'crew' | 'invite'; variant?: 'early' | 'viable' | 'almost' | 'need-one-more' | 'game-on' | 'expired'; expired?: boolean; joined?: boolean; onJoin?: () => void; onInvite?: () => void; onOpen?: () => void }
export declare function PlanForming(props: PlanFormingProps): React.ReactElement;
export interface GameOnPosterProps { activity: string; time: string; place: string; count?: number; people?: Person[] }
export declare function GameOnPoster(props: GameOnPosterProps): React.ReactElement;
export interface ActivityStripProps { activity: string; time: string; place: string; count?: number; capacity?: number; status?: 'forming' | 'confirmed' | 'live' | 'full'; href?: string }
export declare function ActivityStrip(props: ActivityStripProps): React.ReactElement;

/* Competition */
export interface CallOutPosterProps { challenger: Person; opponent: Person; discipline: string; when?: string; status?: 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED'; actions?: boolean; onAccept?: () => void; onCounter?: () => void; onPass?: () => void }
export declare function CallOutPoster(props: CallOutPosterProps): React.ReactElement;
export interface Competitor extends Person { progress?: string }
export interface ChallengeEventHeroProps { a: Competitor; b: Competitor; discipline: string; stage: 'accepted' | 'days' | 'today' | 'soon' | 'live' | 'complete'; when?: string; countdown?: CountdownProps; winner?: string; result?: string }
export declare function ChallengeEventHero(props: ChallengeEventHeroProps): React.ReactElement;
export interface HypePostProps { kind: 'competitor' | 'system' | 'supporter' | 'evidence'; author?: string; body: string; time?: string; side?: string; stats?: { value: string; label: string }[] }
export declare function HypePost(props: HypePostProps): React.ReactElement;
export interface RecapPosterProps { winner: string; discipline: string; date?: string; result?: string; story?: string; stats?: { value: string; label: string }[] }
export declare function RecapPoster(props: RecapPosterProps): React.ReactElement;

/* Identity */
export interface PassportStampProps { title: string; place: string; date: string; kind?: string; tilt?: boolean }
export declare function PassportStamp(props: PassportStampProps): React.ReactElement;

/* Graphic language */
export interface GraphicProps { kind?: 'o' | 'trail' | 'mark' | 'scribble-circle' | 'underline' | 'arrow' | 'crown'; size?: number; strokeWidth?: number; label?: string; className?: string }
export declare function Graphic(props: GraphicProps): React.ReactElement;

/* Added primitives */
export type IconName = 'close' | 'back' | 'forward' | 'plus' | 'more' | 'share' | 'bell' | 'chat' | 'pin' | 'clock' | 'check' | 'alert' | 'offline' | 'lights' | 'search' | 'people';
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;
export interface IconButtonProps { icon: IconName; label: string; variant?: 'plain' | 'outline' | 'solid'; count?: number; disabled?: boolean; onClick?: () => void }
export declare function IconButton(props: IconButtonProps): React.ReactElement;
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string; hint?: string; error?: string; multiline?: boolean; icon?: IconName }
export declare function Input(props: InputProps): React.ReactElement;
export interface DividerProps { kind?: 'hair' | 'strong' | 'mark'; label?: string }
export declare function Divider(props: DividerProps): React.ReactElement;
export interface ImageProps { src?: string; alt: string; ratio?: '1:1' | '4:5' | '16:9' | '3:4'; caption?: string; credit?: string; children?: React.ReactNode }
export declare function Image(props: ImageProps): React.ReactElement;
export interface SheetProps { title: string; children?: React.ReactNode; actions?: React.ReactNode; onClose?: () => void }
export declare function Sheet(props: SheetProps): React.ReactElement;
export interface ModalProps { title: string; body: string; confirm?: string; cancel?: string; onConfirm?: () => void; onCancel?: () => void }
export declare function Modal(props: ModalProps): React.ReactElement;
export interface ToastProps { message: string; kind?: 'neutral' | 'success' | 'offline' | 'error'; action?: string; onAction?: () => void }
export declare function Toast(props: ToastProps): React.ReactElement;
export interface SkeletonProps { kind?: 'strip' | 'object' | 'text'; lines?: number; label?: string }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;

/* Added social */
export interface ParticipantRowProps { person: Person; role?: 'host' | 'in' | 'invited' | 'maybe' | 'checked'; meta?: string; action?: string; onAction?: () => void }
export declare function ParticipantRow(props: ParticipantRowProps): React.ReactElement;
export interface VerificationBadgeProps { level: 'checked-in' | 'result' | 'identity' | 'host' }
export declare function VerificationBadge(props: VerificationBadgeProps): React.ReactElement;
export interface UserMiniCardProps { name: string; handle: string; src?: string; area?: string; verified?: boolean; sports?: string[]; stats?: { value: string; label: string }[]; following?: boolean; onFollow?: () => void; onCallOut?: () => void }
export declare function UserMiniCard(props: UserMiniCardProps): React.ReactElement;
export interface PlaceMiniCardProps { name: string; kind: string; surface?: string; distance?: string; lights?: string; plansTonight?: number; href?: string }
export declare function PlaceMiniCard(props: PlaceMiniCardProps): React.ReactElement;
export interface ReactionBarProps { reactions: { label: string; count: number; mine?: boolean }[]; onReact?: (label: string) => void }
export declare function ReactionBar(props: ReactionBarProps): React.ReactElement;
export interface CommentProps { author: string; body: string; time?: string; badge?: string; respect?: number; respected?: boolean; replies?: number; reply?: boolean; onReply?: () => void; onRespect?: () => void }
export declare function Comment(props: CommentProps): React.ReactElement;
export interface PollProps { question: string; options: { label: string; votes: number }[]; voted?: number; closes?: string; onVote?: (index: number) => void }
export declare function Poll(props: PollProps): React.ReactElement;
export interface CrewMomentumProps { crew: string; memberCount: number; members?: Person[]; weeks: number[]; streak?: number; next?: string }
export declare function CrewMomentum(props: CrewMomentumProps): React.ReactElement;

/* Added movement */
export interface ActivityObjectProps { activity: string; day: string; time: string; place: string; distance?: string; level?: string; count: number; capacity: number; people?: Person[]; status?: 'forming' | 'confirmed' | 'live'; joined?: boolean; details?: boolean; onJoin?: () => void; onOpen?: () => void }
export declare function ActivityObject(props: ActivityObjectProps): React.ReactElement;
export interface RunItBackProps { activity: string; crew: string; lastDate: string; count: number; suggested: string; people?: Person[]; onRun?: () => void; onChange?: () => void }
export declare function RunItBack(props: RunItBackProps): React.ReactElement;

/* Added competition */
export interface LiveCompetitor { name: string; value: number; checkedIn?: boolean }
export interface LiveChallengeProps { a: LiveCompetitor; b: LiveCompetitor; discipline: string; unit: string; target: number; elapsed?: string; watching?: number }
export declare function LiveChallenge(props: LiveChallengeProps): React.ReactElement;
export interface RivalryProps { a: Person; b: Person; record: { a: number; b: number; draws?: number }; history?: ('a' | 'b' | 'd')[]; next?: string }
export declare function Rivalry(props: RivalryProps): React.ReactElement;
export interface RematchProps { requester: string; opponent: string; /** @deprecated use requester (`from` collides with Claude Design's x-import attribute) */ from?: string; /** @deprecated use opponent */ to?: string; discipline: string; lastResult: string; note?: string; onAccept?: () => void; onDecline?: () => void }
export declare function Rematch(props: RematchProps): React.ReactElement;

declare global { interface Window { Ojoro: { Button: typeof Button; DisplayText: typeof DisplayText; Avatar: typeof Avatar; Badge: typeof Badge; Chip: typeof Chip; Progress: typeof Progress; AvatarCluster: typeof AvatarCluster; LiveIndicator: typeof LiveIndicator; Countdown: typeof Countdown; PredictionBar: typeof PredictionBar; CrowdSupport: typeof CrowdSupport; MomentumMeter: typeof MomentumMeter; DownFor: typeof DownFor; PlanForming: typeof PlanForming; GameOnPoster: typeof GameOnPoster; ActivityStrip: typeof ActivityStrip; CallOutPoster: typeof CallOutPoster; ChallengeEventHero: typeof ChallengeEventHero; HypePost: typeof HypePost; RecapPoster: typeof RecapPoster; PassportStamp: typeof PassportStamp; Graphic: typeof Graphic; Icon: typeof Icon; IconButton: typeof IconButton; Input: typeof Input; Divider: typeof Divider; Image: typeof Image; Sheet: typeof Sheet; Modal: typeof Modal; Toast: typeof Toast; Skeleton: typeof Skeleton; ParticipantRow: typeof ParticipantRow; VerificationBadge: typeof VerificationBadge; UserMiniCard: typeof UserMiniCard; PlaceMiniCard: typeof PlaceMiniCard; ReactionBar: typeof ReactionBar; Comment: typeof Comment; Poll: typeof Poll; CrewMomentum: typeof CrewMomentum; ActivityObject: typeof ActivityObject; RunItBack: typeof RunItBack; LiveChallenge: typeof LiveChallenge; Rivalry: typeof Rivalry; Rematch: typeof Rematch } } }

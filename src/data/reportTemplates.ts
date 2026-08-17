import type { ViolationCategory, FiledReport } from '../types/vrchat';

export interface ViolationCategoryDef {
  label: string;
  emoji: string;
  description: string;
  playerOnly?: boolean;
  groupOnly?: boolean;
  subtypes?: string[];
  subtypeLabel?: string;
  subtypeAllowCustom?: boolean;
  urgency?: 'normal' | 'urgent';
}

export const VIOLATION_CATEGORIES: Record<ViolationCategory, ViolationCategoryDef> = {
  harassment: {
    label: 'Harassment / Bullying',
    emoji: '🚫',
    description: 'Targeted, repeated hostile behaviour toward a specific person',
    subtypes: ['One-time incident', 'Ongoing / repeated pattern'],
    subtypeLabel: 'Is this ongoing or a one-time incident?',
  },
  hate_speech: {
    label: 'Hate Speech / Discrimination',
    emoji: '⚠️',
    description: 'Slurs, derogatory language, or content targeting a protected group',
    subtypes: ['Race / ethnicity', 'Gender / sexuality', 'Religion', 'Disability', 'Other'],
    subtypeLabel: 'What protected characteristic was targeted?',
    subtypeAllowCustom: true,
  },
  nsfw_content: {
    label: 'Sexual / NSFW Content',
    emoji: '🔞',
    description: 'Explicit avatar, behaviour, or content in a public or general-audience space',
    subtypes: ['Explicit avatar', 'Sexual behaviour in public instance', 'Sharing explicit media', 'All of the above'],
    subtypeLabel: 'What type of NSFW content?',
  },
  cheating: {
    label: 'Cheating / Exploits',
    emoji: '🛠️',
    description: 'Speed hacking, fly hacking, crashing instances, or abusing game exploits',
    subtypes: ['Speed / fly hacking', 'Instance crashing', 'Lag / network abuse', 'Avatar crashing', 'Other'],
    subtypeLabel: 'What type of cheating?',
    subtypeAllowCustom: true,
  },
  impersonation: {
    label: 'Impersonation',
    emoji: '🎭',
    description: 'Pretending to be another player, content creator, or VRChat staff',
    subtypes: ['Impersonating me', 'Impersonating another specific person', 'Impersonating VRChat staff / team'],
    subtypeLabel: 'Who are they impersonating?',
    subtypeAllowCustom: true,
  },
  spam: {
    label: 'Spam / Advertising',
    emoji: '📢',
    description: 'Unsolicited promotion, invite spam, or repetitive disruptive messaging',
  },
  self_harm: {
    label: 'Self-Harm / Crisis Content',
    emoji: '🆘',
    description: 'Content referencing suicide, self-harm, or signs of a real-world crisis',
    urgency: 'urgent',
  },
  doxxing: {
    label: 'Doxxing / Privacy Violation',
    emoji: '🔍',
    description: "Sharing someone's real personal information without consent",
    subtypes: ['Real name', 'Location / address', 'Contact info', 'Photos / identity', 'Multiple types'],
    subtypeLabel: 'What type of personal information was shared?',
    subtypeAllowCustom: true,
  },
  group_misuse: {
    label: 'Group Misuse',
    emoji: '🏛️',
    description: 'Misleading group description, abusive moderation, or group rule violations',
    groupOnly: true,
    subtypes: ['Misleading group description', 'Abusive moderation by group staff', 'Group rules not enforced', 'Other'],
    subtypeLabel: 'What kind of group misuse?',
    subtypeAllowCustom: true,
  },
  group_harassment: {
    label: 'Coordinated Group Harassment',
    emoji: '👥',
    description: 'A group or its members organising targeted harassment against individuals',
    groupOnly: true,
  },
};

export const PLAYER_CATEGORIES = (Object.keys(VIOLATION_CATEGORIES) as ViolationCategory[])
  .filter(k => !VIOLATION_CATEGORIES[k].groupOnly);

export const GROUP_CATEGORIES = (Object.keys(VIOLATION_CATEGORIES) as ViolationCategory[])
  .filter(k => !VIOLATION_CATEGORIES[k].playerOnly);

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

/**
 * Fallback narrative for when the user picked a bare category instead of a
 * scenario preset. Deliberately plain — the scenario narratives carry the
 * detail when one is chosen.
 */
function defaultNarrative(category: ViolationCategory | undefined, target: string, subtype?: string): string {
  const sub = subtype ? ` (${subtype})` : '';
  switch (category) {
    case 'harassment':
      return `${target} was harassing me${sub}. It was aimed at me specifically rather than being general rudeness, and it made the instance feel like somewhere I didn't want to be.`;
    case 'hate_speech':
      return `${target} was using hate speech${subtype ? ` targeting ${subtype.toLowerCase()}` : ''}. It wasn't an off-hand remark — it was directed at people who had to sit there and hear it.`;
    case 'nsfw_content':
      return `${target} brought explicit content into a general-audience instance${sub}. Nobody present had any warning or any way to opt out of it.`;
    case 'cheating':
      return `${target} was using cheats or exploits${sub}, and it disrupted the instance for everyone in it.`;
    case 'impersonation':
      return `${target} was impersonating someone${sub}. People in the instance took them at face value, which is exactly the problem.`;
    case 'spam':
      return `${target} was spamming the instance — repetitive, unsolicited, and disruptive enough that normal conversation wasn't possible.`;
    case 'self_harm':
      return `I'm reporting this because I'm worried about someone's safety. ${target} said things about self-harm that I didn't feel I could ignore.`;
    case 'doxxing':
      return `${target} shared personal information about someone without their consent${sub}. That information can't be taken back once it's out.`;
    case 'group_misuse':
      return `"${target}" is misusing group features${sub}, in a way that affects the people who join it.`;
    case 'group_harassment':
      return `Members of "${target}" are coordinating harassment against specific people. The pattern is organised rather than coincidental.`;
    default:
      return `${target} broke VRChat's community guidelines.`;
  }
}

/** How the message signs off, tuned to how serious the category is. */
function closingFor(category: ViolationCategory | undefined, urgent: boolean): string {
  if (urgent) {
    return "I'd rather flag this and be wrong than say nothing, so please treat it as a priority.";
  }
  switch (category) {
    case 'harassment':
    case 'hate_speech':
      return "I'd appreciate you looking into it — nobody should have to put up with this to use VRChat.";
    case 'nsfw_content':
      return 'Please review it — this was a space people expected to be safe to walk into.';
    case 'cheating':
      return 'Please take a look, as it affected everyone in the instance rather than just me.';
    case 'impersonation':
      return "Please review the account — people are being misled by it.";
    case 'spam':
      return 'Please take a look — it made the instance unusable while it was happening.';
    case 'doxxing':
      return "This is a privacy issue with real-world consequences, so I'd appreciate it being reviewed and the content removed.";
    case 'group_misuse':
    case 'group_harassment':
      return "I'd like the group reviewed against the community guidelines.";
    default:
      return "I'd appreciate this being looked into.";
  }
}

export function generateReportText(report: Partial<FiledReport>): string {
  const {
    reportType = 'player',
    targetName = '[unknown]',
    targetId = '',
    violationCategory,
    violationSubtype,
    scenarioId,
    userStatement,
    hasEvidence = false,
    evidenceType,
    worldName,
    instanceId,
    incidentTime = Date.now(),
    witnesses,
  } = report;

  const catDef = violationCategory ? VIOLATION_CATEGORIES[violationCategory] : null;
  const scenario = getScenario(scenarioId);
  const isUrgent = catDef?.urgency === 'urgent' || scenario?.id === 'nsfw_minor';

  const isGroup = reportType === 'group';
  const idSuffix = targetId ? ` (${isGroup ? 'group' : 'user'} ID: ${targetId})` : '';
  const subjectName = isGroup ? `"${targetName}"` : targetName;

  // ── Opening ──
  const what = catDef ? catDef.label.toLowerCase() : 'a community guidelines violation';
  const opening = isUrgent
    ? `I need to report ${subjectName}${idSuffix} and I'd like it looked at quickly.`
    : `I'd like to report ${subjectName}${idSuffix} for ${what}.`;

  // ── What happened ──
  // Narratives quote the name themselves where it reads better (groups), so
  // they get the bare name — subjectName is pre-quoted for the opening line.
  const narrative = scenario
    ? scenario.narrative.replace(/\{target\}/g, targetName)
    : defaultNarrative(violationCategory, targetName, violationSubtype);

  // ── When and where ──
  const when = fmt(incidentTime);
  const where = worldName
    ? ` in the world "${worldName}"${instanceId ? ` (instance ${instanceId})` : ''}`
    : '';
  const context = isGroup && !worldName
    ? `I noticed this on ${when}.`
    : `This was on ${when}${where}.`;

  // ── The reporter's own words ──
  const statement = userStatement?.trim() ? userStatement.trim() : '';

  // ── Supporting detail ──
  const support: string[] = [];
  if (hasEvidence) {
    const kind = evidenceType === 'both' ? 'screenshots and video'
      : evidenceType === 'video' ? 'video'
      : 'screenshots';
    support.push(`I have ${kind} of this and can send them over if that helps.`);
  }
  if (witnesses?.trim()) {
    support.push(`Other people who were there: ${witnesses.trim()}.`);
  }

  const paragraphs = [
    opening,
    narrative,
    statement,
    context,
    support.join(' '),
    closingFor(violationCategory, isUrgent),
  ].filter(p => p && p.trim().length > 0);

  const subjectPrefix = isUrgent ? 'URGENT — ' : '';
  const subject = `${subjectPrefix}${catDef?.label ?? 'Community guidelines violation'} – ${targetName}`;

  return `Subject: ${subject}

${paragraphs.join('\n\n')}

Thanks for taking the time to read this.`;
}

// ─── Scenario presets ─────────────────────────────────────────────────────
//
// Categories are the taxonomy VRChat's form wants. Scenarios are how people
// actually describe what happened to them. Picking one fills in the
// category and subtype, and supplies a first-person narrative paragraph so
// the finished report reads like a person wrote it rather than a form.
//
// `{target}` is replaced with the reported name at generation time.

export interface ReportScenario {
  id: string;
  /** How the user would say it — this is the pickable label. */
  label: string;
  /** One line of clarification under the label. */
  hint: string;
  category: ViolationCategory;
  subtype?: string;
  /** Restricts the scenario to one report type; omitted = player. */
  reportType?: 'player' | 'group';
  /** Extra search terms beyond the label and hint. */
  keywords: string[];
  /** The body paragraph. Written in first person, no boilerplate. */
  narrative: string;
  /** Prompt shown above the "in your own words" box for this scenario. */
  followUp?: string;
}

export const REPORT_SCENARIOS: ReportScenario[] = [
  // ── Harassment ──
  {
    id: 'followed_around',
    label: "They followed me around and wouldn't leave me alone",
    hint: 'Trailing you between rooms or instances after being asked to stop',
    category: 'harassment',
    subtype: 'One-time incident',
    keywords: ['follow', 'stalking', 'creep', 'shadow', 'wont leave'],
    narrative: `{target} followed me around the instance and wouldn't leave me alone. I moved away several times and made it clear I wasn't interested in interacting, and they kept following me anyway.`,
    followUp: 'Did you ask them to stop, and what did they do?',
  },
  {
    id: 'repeat_offender',
    label: 'They keep coming back after I blocked them',
    hint: 'Same person returning on alts or rejoining to get at you',
    category: 'harassment',
    subtype: 'Ongoing / repeated pattern',
    keywords: ['block', 'alt', 'again', 'repeat', 'evading', 'ban evasion'],
    narrative: `{target} has repeatedly sought me out after I blocked them. This isn't a one-off — they keep turning up in instances I'm in and continuing the same behaviour, which makes it clear it's deliberate.`,
    followUp: 'Roughly how many times has this happened, and over what period?',
  },
  {
    id: 'verbal_abuse',
    label: 'They were insulting and verbally abusive in voice chat',
    hint: 'Name-calling, threats, or shouting directed at you',
    category: 'harassment',
    subtype: 'One-time incident',
    keywords: ['insult', 'abuse', 'yelling', 'threat', 'name calling', 'toxic'],
    narrative: `{target} was verbally abusive toward me in voice chat — insults and hostile comments aimed directly at me rather than anything resembling normal banter.`,
    followUp: 'What sort of things were they saying?',
  },
  {
    id: 'targeting_friend',
    label: 'They were targeting a friend of mine',
    hint: "You witnessed it happening to someone else",
    category: 'harassment',
    subtype: 'Ongoing / repeated pattern',
    keywords: ['friend', 'witness', 'someone else', 'bullying'],
    narrative: `I watched {target} repeatedly target a friend of mine. I'm reporting it because they were clearly being singled out and it kept going even after people asked {target} to stop.`,
    followUp: 'What was being done to them?',
  },

  // ── Hate speech ──
  {
    id: 'slurs_voice',
    label: 'They were using slurs in voice chat',
    hint: 'Racial, homophobic, or other slurs said out loud',
    category: 'hate_speech',
    keywords: ['slur', 'racist', 'racial', 'nword', 'homophobic', 'transphobic'],
    narrative: `{target} was using slurs openly in voice chat. It wasn't a slip of the tongue — they kept going, and it was clearly aimed at people in the instance.`,
    followUp: 'What was said, and who was it aimed at? (paraphrasing is fine)',
  },
  {
    id: 'hate_avatar',
    label: 'Their avatar or name shows hate symbols',
    hint: 'Extremist imagery, slurs in a display name, hateful signage',
    category: 'hate_speech',
    keywords: ['avatar', 'symbol', 'nazi', 'swastika', 'flag', 'name', 'imagery'],
    narrative: `{target} was wearing an avatar displaying hateful imagery. It's not incidental — the avatar exists to broadcast that message at everyone in the instance.`,
    followUp: 'What was on the avatar or in the name?',
  },
  {
    id: 'targeted_identity',
    label: 'They were harassing someone over who they are',
    hint: 'Abuse aimed at a person’s race, gender, sexuality, or disability',
    category: 'hate_speech',
    keywords: ['identity', 'gender', 'sexuality', 'disability', 'religion', 'targeted'],
    narrative: `{target} singled someone out and abused them over their identity. The comments weren't a general argument — they were specifically about who that person is.`,
    followUp: 'Which characteristic were they targeting, and what did they say?',
  },

  // ── NSFW ──
  {
    id: 'nsfw_public',
    label: 'Explicit avatar in a general-audience world',
    hint: 'Nudity or explicit content somewhere it clearly does not belong',
    category: 'nsfw_content',
    subtype: 'Explicit avatar',
    keywords: ['nsfw', 'nude', 'naked', 'explicit', 'public', 'avatar'],
    narrative: `{target} was wearing an explicit avatar in a public, general-audience instance. There was no content warning and no way for anyone present to avoid seeing it.`,
    followUp: 'Anything else about the world or who was present?',
  },
  {
    id: 'nsfw_behaviour',
    label: 'They were doing sexual things in a public instance',
    hint: 'Sexual behaviour or roleplay in front of everyone',
    category: 'nsfw_content',
    subtype: 'Sexual behaviour in public instance',
    keywords: ['sexual', 'erp', 'behaviour', 'behavior', 'public', 'lewd'],
    narrative: `{target} was engaging in overtly sexual behaviour in a public instance, in full view of everyone there, and carried on when people objected.`,
    followUp: 'What were they doing, and how did people react?',
  },
  {
    id: 'nsfw_minor',
    label: 'They were being sexual toward someone who sounded underage',
    hint: 'Treat as urgent — this is escalated in the report',
    category: 'nsfw_content',
    subtype: 'Sexual behaviour in public instance',
    keywords: ['minor', 'child', 'underage', 'kid', 'grooming', 'predator'],
    narrative: `{target} was behaving sexually toward a user who sounded like a minor. I'm flagging this immediately because of who it was directed at — the other user sounded like a child and {target} continued regardless.`,
    followUp: 'What made you think the other person was underage, and what did {target} do?',
  },
  {
    id: 'nsfw_media',
    label: 'They showed explicit media without warning',
    hint: 'Video screens, posters, or images pushed at the instance',
    category: 'nsfw_content',
    subtype: 'Sharing explicit media',
    keywords: ['video', 'screen', 'media', 'link', 'porn', 'image'],
    narrative: `{target} put explicit media in front of the instance with no warning — nobody there had any say in seeing it.`,
    followUp: 'How was it shown (video player, avatar, poster)?',
  },

  // ── Cheating ──
  {
    id: 'crasher_avatar',
    label: 'They crashed the instance with a crasher avatar',
    hint: 'People froze or dropped out when they switched avatars',
    category: 'cheating',
    subtype: 'Avatar crashing',
    keywords: ['crash', 'crasher', 'freeze', 'client crash', 'avatar'],
    narrative: `{target} used a crasher avatar and took the instance down with it. My game froze the moment they switched, and I wasn't the only one — several people dropped at the same time.`,
    followUp: 'How many people were affected, and did they do it more than once?',
  },
  {
    id: 'fly_speed_hack',
    label: 'They were flying or speed hacking',
    hint: 'Moving in ways the world does not allow',
    category: 'cheating',
    subtype: 'Speed / fly hacking',
    keywords: ['fly', 'flying', 'speed', 'noclip', 'hack', 'cheat', 'modded client'],
    narrative: `{target} was moving around the world in ways it doesn't allow — flying and moving at speeds that aren't possible without a modified client.`,
    followUp: 'What were they doing with it? (reaching blocked areas, breaking a game)',
  },
  {
    id: 'lag_griefing',
    label: 'They were deliberately lagging the instance',
    hint: 'Particle spam or similar, aimed at breaking the room',
    category: 'cheating',
    subtype: 'Lag / network abuse',
    keywords: ['lag', 'particle', 'fps', 'grief', 'spam', 'performance'],
    narrative: `{target} was deliberately tanking the instance's performance — spamming particles and effects until the room was barely usable. It was clearly on purpose rather than a heavy avatar.`,
    followUp: 'What did they use, and how bad did it get?',
  },

  // ── Impersonation ──
  {
    id: 'impersonating_me',
    label: "They're pretending to be me",
    hint: 'Your name, avatar, or profile copied',
    category: 'impersonation',
    subtype: 'Impersonating me',
    keywords: ['impersonate', 'copy', 'me', 'my name', 'my avatar', 'identity'],
    narrative: `{target} is impersonating me — copying my display name and avatar and presenting themselves as me to other people. I've had friends message me about things "I" supposedly said.`,
    followUp: 'What have they done while pretending to be you?',
  },
  {
    id: 'impersonating_scam',
    label: "They're impersonating someone to scam people",
    hint: 'Posing as a creator or friend to get money or trust',
    category: 'impersonation',
    subtype: 'Impersonating another specific person',
    keywords: ['scam', 'fraud', 'creator', 'money', 'phishing', 'commission'],
    narrative: `{target} is posing as someone else in order to scam people — using that person's name and likeness to gain trust and then asking for money or account access.`,
    followUp: 'Who are they pretending to be, and what are they asking people for?',
  },
  {
    id: 'impersonating_staff',
    label: 'They claim to be VRChat staff',
    hint: 'Fake moderator threatening bans or asking for details',
    category: 'impersonation',
    subtype: 'Impersonating VRChat staff / team',
    keywords: ['staff', 'moderator', 'admin', 'official', 'vrchat team'],
    narrative: `{target} was claiming to be VRChat staff — telling people they were being moderated and pressuring them to comply. They aren't staff, and people in the instance believed them.`,
    followUp: 'What were they telling people to do?',
  },

  // ── Spam ──
  {
    id: 'mic_spam',
    label: 'Mic spam / earrape audio',
    hint: 'Blasting music, soundboards, or distorted audio',
    category: 'spam',
    keywords: ['mic', 'earrape', 'soundboard', 'music', 'audio', 'loud', 'noise'],
    narrative: `{target} was mic spamming — playing distorted audio and soundboard clips at full volume, continuously, so that nobody in the instance could hold a conversation.`,
    followUp: 'How long did it go on for?',
  },
  {
    id: 'invite_spam',
    label: 'They spammed invites or links at me',
    hint: 'Repeated unwanted invites or DMs',
    category: 'spam',
    keywords: ['invite', 'spam', 'dm', 'link', 'request', 'repeated'],
    narrative: `{target} repeatedly sent me invites and links I never asked for, and kept going after I declined and asked them to stop.`,
    followUp: 'Roughly how many, and over what period?',
  },
  {
    id: 'advertising',
    label: 'They were constantly advertising something',
    hint: 'Pushing a Discord, shop, or service at everyone',
    category: 'spam',
    keywords: ['advert', 'advertising', 'discord', 'shop', 'promo', 'selling'],
    narrative: `{target} used the instance purely to advertise — repeatedly pushing their own links and services at everyone present and ignoring people asking them to stop.`,
    followUp: 'What were they promoting?',
  },

  // ── Crisis ──
  {
    id: 'self_harm_concern',
    label: "Someone said they're going to hurt themselves",
    hint: 'Flagged as urgent so it reaches VRChat quickly',
    category: 'self_harm',
    keywords: ['suicide', 'self harm', 'crisis', 'hurt themselves', 'emergency', 'help'],
    narrative: `I'm reporting this because I'm genuinely worried about someone's safety. {target} talked about hurting themselves in a way that didn't come across as a joke, and I didn't want to be the person who saw it and said nothing.`,
    followUp: 'What did they say, and are they still in the instance?',
  },

  // ── Doxxing ──
  {
    id: 'doxxed_me',
    label: 'They shared my real personal information',
    hint: 'Real name, address, workplace, or contact details',
    category: 'doxxing',
    subtype: 'Multiple types',
    keywords: ['dox', 'doxx', 'personal', 'real name', 'address', 'private info'],
    narrative: `{target} shared my real personal information with other people without my consent. I never gave them that information to share, and putting it in front of an instance puts me at real-world risk.`,
    followUp: 'What did they share, and who saw it?',
  },
  {
    id: 'doxx_threat',
    label: 'They threatened to leak my information',
    hint: 'Using your details as leverage',
    category: 'doxxing',
    subtype: 'Contact info',
    keywords: ['threat', 'leak', 'blackmail', 'extort', 'expose'],
    narrative: `{target} threatened to publish my personal information — using it as leverage to pressure me into doing what they wanted.`,
    followUp: 'What were they demanding?',
  },
  {
    id: 'doxx_other',
    label: "They posted someone else's photos or details",
    hint: 'Sharing another person’s private information',
    category: 'doxxing',
    subtype: 'Photos / identity',
    keywords: ['photo', 'picture', 'someone else', 'private', 'identity'],
    narrative: `{target} shared another person's private photos and details in the instance without that person's consent.`,
    followUp: "Whose information was it, and how was it shared?",
  },

  // ── Group scenarios ──
  {
    id: 'group_staff_abuse',
    label: 'Group staff are abusing their moderation powers',
    hint: 'Bans or kicks with no reason, or used as punishment',
    category: 'group_misuse',
    subtype: 'Abusive moderation by group staff',
    reportType: 'group',
    keywords: ['staff', 'moderator', 'ban', 'kick', 'power', 'abuse'],
    narrative: `The staff of "{target}" are using their moderation tools punitively rather than for moderation — banning and kicking people without cause or explanation, including for disagreeing with them.`,
    followUp: 'What happened to you or the person affected?',
  },
  {
    id: 'group_misleading',
    label: "The group isn't what it says it is",
    hint: 'Description or listing that misrepresents the group',
    category: 'group_misuse',
    subtype: 'Misleading group description',
    reportType: 'group',
    keywords: ['misleading', 'description', 'fake', 'bait', 'lying'],
    narrative: `"{target}" is advertised as something it clearly isn't. The public description doesn't match what actually goes on in its instances, which means people join with no idea what they're walking into.`,
    followUp: 'What does it claim to be, and what is it actually?',
  },
  {
    id: 'group_unmoderated',
    label: 'The group lets its own rules be broken',
    hint: 'Stated rules never enforced in their instances',
    category: 'group_misuse',
    subtype: 'Group rules not enforced',
    reportType: 'group',
    keywords: ['rules', 'unmoderated', 'enforce', 'ignore', 'nobody'],
    narrative: `"{target}" publishes rules it doesn't enforce. Behaviour its own rules prohibit happens openly in its instances with staff present and nothing is done about it.`,
    followUp: 'Which rule was being broken, and were staff around?',
  },
  {
    id: 'group_brigading',
    label: 'The group organises harassment of people',
    hint: 'Members coordinating to target someone',
    category: 'group_harassment',
    reportType: 'group',
    keywords: ['brigade', 'raid', 'coordinated', 'organised', 'organized', 'gang'],
    narrative: `Members of "{target}" are coordinating harassment against specific people — arriving together in the same instances and targeting the same person, which makes it organised rather than coincidental.`,
    followUp: 'Who was targeted, and how many members were involved?',
  },
];

export const PLAYER_SCENARIOS = REPORT_SCENARIOS.filter(s => (s.reportType ?? 'player') === 'player');
export const GROUP_SCENARIOS  = REPORT_SCENARIOS.filter(s => s.reportType === 'group');

export function getScenario(id?: string): ReportScenario | undefined {
  return id ? REPORT_SCENARIOS.find(s => s.id === id) : undefined;
}

/** Free-text search across label, hint, category and keywords. */
export function searchScenarios(list: ReportScenario[], query: string): ReportScenario[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const terms = q.split(/\s+/);
  return list.filter(s => {
    const hay = [
      s.label, s.hint, s.category.replace(/_/g, ' '),
      VIOLATION_CATEGORIES[s.category].label, ...s.keywords,
    ].join(' ').toLowerCase();
    return terms.every(t => hay.includes(t));
  });
}

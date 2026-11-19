import {
  FinanceLevel, FitnessLevel, Hero, LuckLevel, PersonalityTrait, SocialSkillLevel,
} from './hero';

const FITNESS_DESCRIPTIONS: Record<FitnessLevel, string> = {
  Frail: 'tires easily and needs time to recover from physical effort.',
  Untrained: 'has yet to build his strength and endurance.',
  Fit: 'has the energy and stamina to meet everyday challenges.',
  Strong: 'has the strength to carry heavy burdens and keep going.',
  Athletic: 'moves with the strength and endurance of an athlete.',
};

const FINANCE_DESCRIPTIONS: Record<FinanceLevel, string> = {
  Strapped: 'Money is tight, so every expense matters.',
  Modest: 'He starts with a small financial cushion and must spend carefully.',
  Stable: 'His everyday needs are covered, giving him room to plan ahead.',
  Affluent: 'A comfortable financial start gives him more choices.',
  Wealthy: 'He starts with abundant resources and room for big ambitions.',
};

const PERSONALITY_DESCRIPTIONS: Record<PersonalityTrait, string> = {
  openness: 'Curiosity draws him toward unfamiliar ideas and experiences.',
  conscientiousness: 'He likes to plan ahead, keep his promises and see things through.',
  extraversion: 'People and lively surroundings bring out his energy.',
  agreeableness: 'He considers how others feel and looks for common ground.',
  neuroticism: 'He feels things deeply, and uncertainty can weigh on him.',
};

const SOCIAL_DESCRIPTIONS: Record<SocialSkillLevel, string> = {
  Awkward: 'Finding the right words with new people takes effort.',
  Reserved: 'He takes his time warming up to new people.',
  Friendly: 'His friendly manner makes him easy to approach and talk to.',
  Sociable: 'Conversations come easily, helping him build new connections.',
  Charming: 'His charm helps him make a warm and lasting impression.',
};

const LUCK_DESCRIPTIONS: Record<LuckLevel, string> = {
  Cursed: 'Misfortune has a way of finding him, even when he plans carefully.',
  Unlucky: 'Unexpected setbacks tend to cross his path.',
  Ordinary: 'Chance brings him a fairly even mix of good and bad breaks.',
  Lucky: 'Chance often lends a hand, opening doors when he least expects it.',
  Blessed: 'Fortune often turns in his favor, even in difficult moments.',
};

export class HeroSummary {
  constructor(private readonly hero: Hero) {}

  get ready(): boolean {
    return !!this.hero.name && Object.values(this.hero.blueprint).every(value => value !== null);
  }

  get paragraphs(): string[] {
    if (!this.ready) return [];
    const { fitness, finance, personality, socialSkill, luck } = this.hero.blueprint;
    return [
      `${this.hero.name} ${FITNESS_DESCRIPTIONS[fitness!]} ${FINANCE_DESCRIPTIONS[finance!]}`,
      `${PERSONALITY_DESCRIPTIONS[personality!]} ${SOCIAL_DESCRIPTIONS[socialSkill!]}`,
      LUCK_DESCRIPTIONS[luck!],
    ];
  }
}

import {
  FinanceLevel, FitnessLevel, Hero, LuckLevel, PersonalityTrait, SocialSkillLevel, PERSONALITY_TYPES,
} from './hero';

const FITNESS_DESCRIPTIONS: Record<FitnessLevel, string> = {
  Frail: 'Low stamina, tires easily.',
  Untrained: 'Needs practice to build endurance.',
  Fit: 'Healthy stamina for daily challenges.',
  Strong: 'Powerful and physically resilient.',
  Athletic: 'Excellent strength and endurance.',
};

const FINANCE_DESCRIPTIONS: Record<FinanceLevel, string> = {
  Strapped: 'Very limited money to spare.',
  Modest: 'A small financial cushion.',
  Stable: 'Enough resources for everyday needs.',
  Affluent: 'Comfortable resources and more choices.',
  Wealthy: 'Abundant resources for big ambitions.',
};

const PERSONALITY_DESCRIPTIONS: Record<PersonalityTrait, string> = {
  openness: 'Curious and drawn to new ideas.',
  conscientiousness: 'Organized, careful and dependable.',
  extraversion: 'Energized by people and activity.',
  agreeableness: 'Cooperative and considerate of others.',
  neuroticism: 'Emotionally sensitive to stress.',
};

const SOCIAL_DESCRIPTIONS: Record<SocialSkillLevel, string> = {
  Awkward: 'Finds social situations challenging.',
  Reserved: 'Takes time to warm up.',
  Friendly: 'Approachable and easy to talk to.',
  Sociable: 'Builds connections with ease.',
  Charming: 'Makes a warm, lasting impression.',
};

const LUCK_DESCRIPTIONS: Record<LuckLevel, string> = {
  Cursed: 'Misfortune often finds its way in.',
  Unlucky: 'Prone to unfortunate surprises.',
  Ordinary: 'An even mix of good and bad breaks.',
  Lucky: 'Good breaks tend to come along.',
  Blessed: 'Fortune often turns in his favor.',
};

export class HeroSummary {
  constructor(private readonly hero: Hero) {}

  get ready(): boolean {
    return !!this.hero.name && Object.values(this.hero.blueprint).every(value => value !== null);
  }

  get entries(): { label: string; value: string; description: string }[] {
    const { fitness, finance, personality, socialSkill, luck } = this.hero.blueprint;
    return [
      { label: 'FITNESS', value: fitness ?? '', description: fitness ? FITNESS_DESCRIPTIONS[fitness] : 'Not revealed yet.' },
      { label: 'FINANCE', value: finance ?? '', description: finance ? FINANCE_DESCRIPTIONS[finance] : 'Not revealed yet.' },
      { label: 'TYPE', value: PERSONALITY_TYPES.find(type => type.trait === personality)?.label ?? '', description: personality ? PERSONALITY_DESCRIPTIONS[personality] : 'Not revealed yet.' },
      { label: 'SOCIAL', value: socialSkill ?? '', description: socialSkill ? SOCIAL_DESCRIPTIONS[socialSkill] : 'Not revealed yet.' },
      { label: 'LUCK', value: luck ?? '', description: luck ? LUCK_DESCRIPTIONS[luck] : 'Not revealed yet.' },
    ];
  }
}

export type PersonalityTrait =
  | 'openness'
  | 'conscientiousness'
  | 'extraversion'
  | 'agreeableness'
  | 'neuroticism';

export const PERSONALITY_TYPES = [
  { trait: 'openness', label: 'Open' },
  { trait: 'conscientiousness', label: 'Diligent' },
  { trait: 'extraversion', label: 'Outgoing' },
  { trait: 'agreeableness', label: 'Agreeable' },
  { trait: 'neuroticism', label: 'Sensitive' },
] as const;

export interface HeroBlueprint {
  fitness: FitnessLevel | null;
  finance: FinanceLevel | null;
  personality: PersonalityTrait | null;
  socialSkill: SocialSkillLevel | null;
  luck: LuckLevel | null;
}

export const FITNESS_LEVELS = ['Frail', 'Untrained', 'Fit', 'Strong', 'Athletic'] as const;
export type FitnessLevel = typeof FITNESS_LEVELS[number];

export const FINANCE_LEVELS = ['Strapped', 'Modest', 'Stable', 'Affluent', 'Wealthy'] as const;
export type FinanceLevel = typeof FINANCE_LEVELS[number];

export const SOCIAL_SKILL_LEVELS = ['Awkward', 'Reserved', 'Friendly', 'Sociable', 'Charming'] as const;
export type SocialSkillLevel = typeof SOCIAL_SKILL_LEVELS[number];

export const LUCK_LEVELS = ['Cursed', 'Unlucky', 'Ordinary', 'Lucky', 'Blessed'] as const;
export type LuckLevel = typeof LUCK_LEVELS[number];

export const GENESIS_BOY_NAMES: readonly string[] = [
  'Aaron', 'Adam', 'Adrian', 'Alex', 'Andrei', 'Anthony', 'Arthur', 'Asher', 'Austin', 'Benjamin',
  'Blake', 'Caleb', 'Cameron', 'Carter', 'Charles', 'Christian', 'Connor', 'Daniel', 'David', 'Dominic',
  'Dylan', 'Edward', 'Eli', 'Elijah', 'Elliot', 'Emmett', 'Eric', 'Ethan', 'Evan', 'Felix',
  'Finn', 'Gabriel', 'George', 'Grayson', 'Henry', 'Hugo', 'Hunter', 'Ian', 'Isaac', 'Jack',
  'Jacob', 'James', 'Jason', 'Jasper', 'Jayden', 'Joel', 'John', 'Jonah', 'Joseph', 'Joshua',
  'Julian', 'Kai', 'Leo', 'Leon', 'Levi', 'Liam', 'Logan', 'Louis', 'Lucas', 'Luke',
  'Mason', 'Mateo', 'Matthew', 'Max', 'Michael', 'Miles', 'Nathan', 'Nicholas', 'Noah', 'Nolan',
  'Oliver', 'Oscar', 'Owen', 'Peter', 'Philip', 'Rafael', 'Reuben', 'Robert', 'Roman', 'Ryan',
  'Samuel', 'Sebastian', 'Simon', 'Theo', 'Thomas', 'Tobias', 'Tristan', 'Tyler', 'Victor', 'Vincent',
  'Wesley', 'William', 'Wyatt', 'Xavier', 'Zachary', 'Darius', 'Emil', 'Mihai', 'Radu', 'Vlad',
];

export class Hero {
  name = '';
  readonly blueprint: HeroBlueprint = {
    fitness: null,
    finance: null,
    personality: null,
    socialSkill: null,
    luck: null,
  };

  reset(): void {
    this.name = '';
    this.blueprint.fitness = null;
    this.blueprint.finance = null;
    this.blueprint.personality = null;
    this.blueprint.socialSkill = null;
    this.blueprint.luck = null;
  }
}

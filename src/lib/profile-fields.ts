/** Legacy questionnaire fields restored from edit_profile.asp */

export type ProfileField = {
  key: string;
  column: string;
  label: string;
  hint?: string;
};

export const PROFILE_MISC: ProfileField[] = [
  { key: "favoriteColor", column: "favorite_color", label: "Favorite Color" },
  { key: "favoriteQuote", column: "favorite_quote", label: "Favorite Quote" },
  {
    key: "heroes",
    column: "heroes",
    label: "Who are Your Heroes or Role Models?",
  },
  {
    key: "wishes",
    column: "wishes",
    label: "If You Had Three Wishes, What Would They Be?",
    hint: "No wishing for more wishes. Use line breaks to separate wishes.",
  },
  {
    key: "alternateTime",
    column: "alternate_time",
    label: "If You Could Live in a Different Time Period, What Would it Be?",
  },
  {
    key: "favoriteTimeOfYear",
    column: "favorite_time_of_year",
    label: "What is Your Favorite Time of Year?",
  },
  {
    key: "tripToAnywhere",
    column: "trip_to_anywhere",
    label: "If You Could Take a Trip to Anywhere, Where Would You Go?",
  },
  {
    key: "familyTrip",
    column: "family_trip",
    label:
      "What was Your Favorite Family Trip, Either as a Child or as an Adult or Both?",
  },
  {
    key: "win20k",
    column: "win_20k",
    label:
      "If You Won $20,000, Assuming it was Tax-Free, What Would You Do With it?",
  },
  {
    key: "win200k",
    column: "win_200k",
    label:
      "If You Won $200,000, Assuming it was Tax-Free, What Would You Do With it?",
  },
  {
    key: "win2m",
    column: "win_2m",
    label:
      "If You Won $2,000,000, Assuming it was Tax-Free, What Would You Do With it?",
  },
];

export const PROFILE_FOOD: ProfileField[] = [
  { key: "favoriteFood", column: "favorite_food", label: "Favorite Food Item" },
  {
    key: "favoriteMeal",
    column: "favorite_meal",
    label: "Favorite Meal",
    hint: "Breakfast, Lunch, Dinner, etc.",
  },
  {
    key: "favoriteBreakfast",
    column: "favorite_breakfast",
    label: "Favorite Breakfast",
  },
  { key: "favoriteLunch", column: "favorite_lunch", label: "Favorite Lunch" },
  { key: "favoriteDinner", column: "favorite_dinner", label: "Favorite Dinner" },
  {
    key: "favoriteCuisine",
    column: "favorite_cuisine",
    label: "Favorite Cuisine",
    hint: "Chinese, Italian, Mexican, etc.",
  },
  { key: "favoriteSnack", column: "favorite_snack", label: "Favorite Snack" },
  { key: "favoriteDrink", column: "favorite_drink", label: "Favorite Beverage" },
  {
    key: "favoriteAlcoholicDrink",
    column: "favorite_alcoholic_drink",
    label: "Favorite Alcoholic Beverage",
  },
  {
    key: "favoriteCondiment",
    column: "favorite_condiment",
    label: "Favorite Condiment",
  },
  {
    key: "favoriteDessert",
    column: "favorite_dessert",
    label: "Favorite Dessert",
  },
  {
    key: "favoriteRestaurant",
    column: "favorite_restaurant",
    label: "Favorite Restaurant",
  },
];

export const PROFILE_ENTERTAINMENT: ProfileField[] = [
  { key: "favoriteSong", column: "favorite_song", label: "Favorite Song(s)" },
  {
    key: "favoriteSinger",
    column: "favorite_singer",
    label: "Favorite Singer(s)",
  },
  { key: "favoriteBand", column: "favorite_band", label: "Favorite Band(s)" },
  {
    key: "favoriteMovie",
    column: "favorite_movie",
    label: "Favorite Movie(s)",
  },
  {
    key: "favoriteActor",
    column: "favorite_actor",
    label: "Favorite Actor(s)",
  },
  {
    key: "favoriteActress",
    column: "favorite_actress",
    label: "Favorite Actress(es)",
  },
  {
    key: "favoriteTvShow",
    column: "favorite_tv_show",
    label: "Favorite TV Show(s)",
  },
  {
    key: "sportWatch",
    column: "sport_watch",
    label: "Favorite Sport to Watch",
  },
  { key: "sportPlay", column: "sport_play", label: "Favorite Sport to Play" },
  {
    key: "sportTeam",
    column: "sport_team",
    label: "Favorite Professional Team",
  },
  {
    key: "sportPlayer",
    column: "sport_player",
    label: "Favorite Professional Player",
    hint: "Past or Present",
  },
];

export const PROFILE_PIVOT: ProfileField[] = [
  {
    key: "bpFavoriteWord",
    column: "bp_favorite_word",
    label: "What Is Your Favorite Word?",
  },
  {
    key: "bpLeastFavoriteWord",
    column: "bp_least_favorite_word",
    label: "What Is Your Least Favorite Word?",
  },
  {
    key: "bpTurnOn",
    column: "bp_turn_on",
    label: "What Turns You On Creatively, Spiritually, or Emotionally?",
  },
  { key: "bpTurnOff", column: "bp_turn_off", label: "What Turns You Off?" },
  {
    key: "bpSoundLove",
    column: "bp_sound_love",
    label: "What Sound Do You Love?",
  },
  {
    key: "bpSoundHate",
    column: "bp_sound_hate",
    label: "What Sound Do You Hate?",
  },
  {
    key: "bpFavoriteCurseWord",
    column: "bp_favorite_curse_word",
    label: "What Is Your Favorite Curse Word?",
  },
  {
    key: "bpProfessionAttempt",
    column: "bp_profession_attempt",
    label: "What Profession Other Than Yours Would You Like To Attempt?",
  },
  {
    key: "bpProfessionNotAttempt",
    column: "bp_profession_not_attempt",
    label: "What Profession Would You Not Like To Participate In?",
  },
  {
    key: "bpGodSay",
    column: "bp_god_say",
    label:
      "If Heaven Exists, What Would You Like To Hear God Say When You Arrive At The Pearly Gates?",
  },
];

export const ALL_QUESTIONNAIRE = [
  ...PROFILE_MISC,
  ...PROFILE_FOOD,
  ...PROFILE_ENTERTAINMENT,
  ...PROFILE_PIVOT,
];

export const QUESTIONNAIRE_COLUMNS = ALL_QUESTIONNAIRE.map((f) => f.column);

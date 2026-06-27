/** Pictionary-friendly words — common enough to draw, distinct enough to guess. */
export const GAME_WORDS: string[] = [
  // Animals
  'cat', 'dog', 'fish', 'bird', 'snake', 'lion', 'tiger', 'bear', 'elephant', 'monkey',
  'penguin', 'giraffe', 'rabbit', 'frog', 'shark', 'whale', 'horse', 'cow', 'pig', 'duck',
  'owl', 'bee', 'butterfly', 'spider', 'crab', 'turtle', 'parrot', 'wolf', 'fox', 'deer',
  // Food & drink
  'pizza', 'burger', 'taco', 'sushi', 'cake', 'apple', 'banana', 'strawberry', 'watermelon',
  'ice cream', 'coffee', 'donut', 'sandwich', 'pasta', 'popcorn', 'cookie', 'grapes', 'lemon',
  'carrot', 'mushroom', 'egg', 'bread', 'cupcake', 'chocolate',
  // Objects / home
  'chair', 'table', 'lamp', 'bed', 'door', 'window', 'clock', 'mirror', 'umbrella',
  'backpack', 'key', 'phone', 'camera', 'book', 'pencil', 'glasses', 'hat', 'shoes',
  'sock', 'glove', 'guitar', 'drum', 'piano', 'balloon', 'candle', 'scissors', 'brush',
  'ladder', 'bucket', 'hammer', 'magnet', 'envelope', 'crown',
  // Nature
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'tree', 'flower', 'leaf', 'mountain',
  'river', 'ocean', 'island', 'volcano', 'cactus', 'snowflake', 'lightning', 'wave',
  // Vehicles & places
  'car', 'bus', 'train', 'plane', 'boat', 'rocket', 'bicycle', 'helicopter',
  'bridge', 'house', 'castle', 'tent', 'lighthouse', 'windmill',
  // Actions (draw the concept)
  'sleeping', 'running', 'jumping', 'swimming', 'flying', 'dancing', 'singing', 'cooking',
  'reading', 'painting', 'fishing', 'climbing', 'skating', 'surfing', 'hugging',
  // Misc fun
  'ghost', 'alien', 'robot', 'dragon', 'superhero', 'treasure', 'bomb', 'trophy',
  'heart', 'flag', 'map', 'compass', 'telescope', 'magician', 'witch', 'snowman',
  'fireworks', 'diamond', 'rocket ship', 'tornado', 'rainbow',
];

export function pickRandomWord(): string {
  return GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];
}

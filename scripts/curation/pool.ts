/**
 * Tangent curation: the hand-curated ENDPOINT POOL + the connector seed.
 *
 * ENDPOINTS are the only articles that may be a START or a TARGET in a curated
 * pair. They are household-name people, places (cities / landmarks, NOT whole
 * countries), foods, animals, science, pop culture, sport, music, film,
 * history, art, tech, and myth. Each carries one or more theme tags so a pair
 * gets a themeTag when both endpoints share a theme (Series mode).
 *
 * CONNECTORS are NOT endpoints (countries, continents, languages, very broad
 * topics). They are seeded into the traversal universe so famous-to-famous
 * paths have their natural bridges, but they are banned as start/target per
 * the spec (countries / years / lists are intermediates only).
 *
 * Titles are canonical English Wikipedia titles (spaces). The build resolves
 * each through the Action API (redirects + namespace) and drops any that are
 * missing or non-mainspace, so a stray title here is self-healing.
 */

export type Theme =
  | 'science'
  | 'history'
  | 'geography'
  | 'sports'
  | 'music'
  | 'film'
  | 'food'
  | 'animals'
  | 'art'
  | 'technology'
  | 'mythology'
  | 'popculture'

export interface Endpoint {
  title: string
  themes: Theme[]
}

/** The curated endpoint pool. Recognizable, concrete, never a country/year/list. */
export const ENDPOINTS: Endpoint[] = [
  // ── Science (people + concepts) ─────────────────────────────────────────
  { title: 'Albert Einstein', themes: ['science', 'history'] },
  { title: 'Isaac Newton', themes: ['science', 'history'] },
  { title: 'Charles Darwin', themes: ['science', 'history'] },
  { title: 'Marie Curie', themes: ['science', 'history'] },
  { title: 'Galileo Galilei', themes: ['science', 'history'] },
  { title: 'Stephen Hawking', themes: ['science'] },
  { title: 'Nikola Tesla', themes: ['science', 'technology'] },
  { title: 'Charles Babbage', themes: ['science', 'technology'] },
  { title: 'Ada Lovelace', themes: ['science', 'technology'] },
  { title: 'Gravity', themes: ['science'] },
  { title: 'DNA', themes: ['science'] },
  { title: 'Photosynthesis', themes: ['science', 'animals'] },
  { title: 'Evolution', themes: ['science'] },
  { title: 'Black hole', themes: ['science'] },
  { title: 'Periodic table', themes: ['science'] },
  { title: 'Atom', themes: ['science'] },
  { title: 'Electricity', themes: ['science', 'technology'] },
  { title: 'Vaccine', themes: ['science'] },
  { title: 'Penicillin', themes: ['science'] },
  { title: 'Oxygen', themes: ['science'] },
  { title: 'Water', themes: ['science'] },
  { title: 'Sun', themes: ['science'] },
  { title: 'Moon', themes: ['science'] },
  { title: 'Solar System', themes: ['science'] },
  { title: 'Mars', themes: ['science'] },
  { title: 'Jupiter', themes: ['science'] },
  { title: 'Mercury (planet)', themes: ['science'] },
  { title: 'Big Bang', themes: ['science'] },
  { title: 'Theory of relativity', themes: ['science'] },
  { title: 'Quantum mechanics', themes: ['science'] },
  { title: 'Volcano', themes: ['science', 'geography'] },
  { title: 'Earthquake', themes: ['science', 'geography'] },
  { title: 'Dinosaur', themes: ['science', 'animals'] },
  { title: 'Human brain', themes: ['science'] },
  { title: 'Heart', themes: ['science'] },
  { title: 'Bacteria', themes: ['science'] },
  { title: 'Virus', themes: ['science'] },
  { title: 'Genetics', themes: ['science'] },
  { title: 'Climate change', themes: ['science'] },
  { title: 'Lightning', themes: ['science'] },

  // ── History (people + events) ───────────────────────────────────────────
  { title: 'World War II', themes: ['history'] },
  { title: 'World War I', themes: ['history'] },
  { title: 'Roman Empire', themes: ['history'] },
  { title: 'Ancient Egypt', themes: ['history'] },
  { title: 'Ancient Greece', themes: ['history'] },
  { title: 'Napoleon', themes: ['history'] },
  { title: 'Julius Caesar', themes: ['history'] },
  { title: 'Cleopatra', themes: ['history'] },
  { title: 'Alexander the Great', themes: ['history'] },
  { title: 'Genghis Khan', themes: ['history'] },
  { title: 'Adolf Hitler', themes: ['history'] },
  { title: 'Abraham Lincoln', themes: ['history'] },
  { title: 'George Washington', themes: ['history'] },
  { title: 'Winston Churchill', themes: ['history'] },
  { title: 'Mahatma Gandhi', themes: ['history'] },
  { title: 'Martin Luther King Jr.', themes: ['history'] },
  { title: 'Nelson Mandela', themes: ['history'] },
  { title: 'Christopher Columbus', themes: ['history'] },
  { title: 'Joan of Arc', themes: ['history'] },
  { title: 'Queen Victoria', themes: ['history'] },
  { title: 'Elizabeth I', themes: ['history'] },
  { title: 'French Revolution', themes: ['history'] },
  { title: 'American Civil War', themes: ['history'] },
  { title: 'Cold War', themes: ['history'] },
  { title: 'Berlin Wall', themes: ['history'] },
  { title: 'Renaissance', themes: ['history', 'art'] },
  { title: 'Industrial Revolution', themes: ['history', 'technology'] },
  { title: 'Great Wall of China', themes: ['history', 'geography'] },
  { title: 'Vikings', themes: ['history'] },
  { title: 'Samurai', themes: ['history'] },

  // ── Geography (cities + landmarks + natural features) ────────────────────
  { title: 'Mount Everest', themes: ['geography'] },
  { title: 'Amazon River', themes: ['geography'] },
  { title: 'Sahara', themes: ['geography'] },
  { title: 'Nile', themes: ['geography'] },
  { title: 'Grand Canyon', themes: ['geography'] },
  { title: 'Niagara Falls', themes: ['geography'] },
  { title: 'Great Barrier Reef', themes: ['geography', 'animals'] },
  { title: 'Mount Fuji', themes: ['geography'] },
  { title: 'Eiffel Tower', themes: ['geography'] },
  { title: 'Statue of Liberty', themes: ['geography'] },
  { title: 'Colosseum', themes: ['geography', 'history'] },
  { title: 'Taj Mahal', themes: ['geography'] },
  { title: 'Big Ben', themes: ['geography'] },
  { title: 'Stonehenge', themes: ['geography', 'history'] },
  { title: 'Machu Picchu', themes: ['geography', 'history'] },
  { title: 'Pacific Ocean', themes: ['geography'] },
  { title: 'Atlantic Ocean', themes: ['geography'] },
  { title: 'Mount Kilimanjaro', themes: ['geography'] },
  { title: 'Antarctica', themes: ['geography'] },
  { title: 'Amazon rainforest', themes: ['geography', 'animals'] },
  { title: 'New York City', themes: ['geography'] },
  { title: 'London', themes: ['geography'] },
  { title: 'Paris', themes: ['geography'] },
  { title: 'Tokyo', themes: ['geography'] },
  { title: 'Rome', themes: ['geography'] },
  { title: 'Venice', themes: ['geography'] },
  { title: 'Los Angeles', themes: ['geography'] },
  { title: 'Hong Kong', themes: ['geography'] },
  { title: 'Dubai', themes: ['geography'] },
  { title: 'Istanbul', themes: ['geography'] },
  { title: 'Mount Vesuvius', themes: ['geography', 'history'] },
  { title: 'Mississippi River', themes: ['geography'] },

  // ── Sports ──────────────────────────────────────────────────────────────
  { title: 'Association football', themes: ['sports'] },
  { title: 'Basketball', themes: ['sports'] },
  { title: 'Tennis', themes: ['sports'] },
  { title: 'Cricket', themes: ['sports'] },
  { title: 'Baseball', themes: ['sports'] },
  { title: 'American football', themes: ['sports'] },
  { title: 'Olympic Games', themes: ['sports'] },
  { title: 'FIFA World Cup', themes: ['sports'] },
  { title: 'Michael Jordan', themes: ['sports'] },
  { title: 'Pelé', themes: ['sports'] },
  { title: 'Muhammad Ali', themes: ['sports'] },
  { title: 'Lionel Messi', themes: ['sports'] },
  { title: 'Cristiano Ronaldo', themes: ['sports'] },
  { title: 'Serena Williams', themes: ['sports'] },
  { title: 'Usain Bolt', themes: ['sports'] },
  { title: 'Roger Federer', themes: ['sports'] },
  { title: 'Tiger Woods', themes: ['sports'] },
  { title: 'Wimbledon Championships', themes: ['sports'] },
  { title: 'Formula One', themes: ['sports'] },
  { title: 'Boxing', themes: ['sports'] },
  { title: 'Golf', themes: ['sports'] },
  { title: 'Chess', themes: ['sports'] },
  { title: 'Marathon', themes: ['sports'] },

  // ── Music ───────────────────────────────────────────────────────────────
  { title: 'The Beatles', themes: ['music', 'popculture'] },
  { title: 'Elvis Presley', themes: ['music', 'popculture'] },
  { title: 'Michael Jackson', themes: ['music', 'popculture'] },
  { title: 'Beyoncé', themes: ['music', 'popculture'] },
  { title: 'Madonna', themes: ['music', 'popculture'] },
  { title: 'Bob Dylan', themes: ['music'] },
  { title: 'Wolfgang Amadeus Mozart', themes: ['music'] },
  { title: 'Ludwig van Beethoven', themes: ['music'] },
  { title: 'Queen (band)', themes: ['music', 'popculture'] },
  { title: 'Pink Floyd', themes: ['music'] },
  { title: 'Led Zeppelin', themes: ['music'] },
  { title: 'Taylor Swift', themes: ['music', 'popculture'] },
  { title: 'Jazz', themes: ['music'] },
  { title: 'Rock music', themes: ['music'] },
  { title: 'Hip hop music', themes: ['music'] },
  { title: 'Guitar', themes: ['music'] },
  { title: 'Piano', themes: ['music'] },
  { title: 'Opera', themes: ['music', 'art'] },
  { title: 'Frank Sinatra', themes: ['music', 'film'] },
  { title: 'David Bowie', themes: ['music'] },
  { title: 'Bob Marley', themes: ['music'] },

  // ── Film & TV ───────────────────────────────────────────────────────────
  { title: 'Star Wars', themes: ['film', 'popculture'] },
  { title: 'Harry Potter', themes: ['film', 'popculture'] },
  { title: 'The Lord of the Rings', themes: ['film', 'popculture'] },
  { title: 'Marvel Cinematic Universe', themes: ['film', 'popculture'] },
  { title: 'Batman', themes: ['film', 'popculture'] },
  { title: 'Superman', themes: ['film', 'popculture'] },
  { title: 'Spider-Man', themes: ['film', 'popculture'] },
  { title: 'Walt Disney', themes: ['film'] },
  { title: 'Alfred Hitchcock', themes: ['film'] },
  { title: 'Steven Spielberg', themes: ['film'] },
  { title: 'Charlie Chaplin', themes: ['film'] },
  { title: 'James Bond', themes: ['film', 'popculture'] },
  { title: 'The Simpsons', themes: ['film', 'popculture'] },
  { title: 'Game of Thrones', themes: ['film', 'popculture'] },
  { title: 'Hollywood', themes: ['film'] },
  { title: 'Academy Awards', themes: ['film'] },
  { title: 'Leonardo DiCaprio', themes: ['film', 'popculture'] },
  { title: 'Tom Hanks', themes: ['film'] },
  { title: 'Marilyn Monroe', themes: ['film', 'popculture'] },
  { title: 'Audrey Hepburn', themes: ['film'] },

  // ── Food & Drink ────────────────────────────────────────────────────────
  { title: 'Pizza', themes: ['food'] },
  { title: 'Chocolate', themes: ['food'] },
  { title: 'Coffee', themes: ['food'] },
  { title: 'Tea', themes: ['food'] },
  { title: 'Wine', themes: ['food'] },
  { title: 'Beer', themes: ['food'] },
  { title: 'Hamburger', themes: ['food'] },
  { title: 'Sushi', themes: ['food'] },
  { title: 'Bread', themes: ['food'] },
  { title: 'Cheese', themes: ['food'] },
  { title: 'Rice', themes: ['food'] },
  { title: 'Pasta', themes: ['food'] },
  { title: 'Banana', themes: ['food', 'animals'] },
  { title: 'Apple', themes: ['food', 'animals'] },
  { title: 'Honey', themes: ['food', 'animals'] },
  { title: 'Ice cream', themes: ['food'] },
  { title: 'Chili pepper', themes: ['food'] },
  { title: 'Potato', themes: ['food'] },
  { title: 'Tomato', themes: ['food'] },
  { title: 'Curry', themes: ['food'] },
  { title: 'Whisky', themes: ['food'] },

  // ── Animals & Nature ────────────────────────────────────────────────────
  { title: 'Lion', themes: ['animals'] },
  { title: 'Tiger', themes: ['animals'] },
  { title: 'Elephant', themes: ['animals'] },
  { title: 'Dog', themes: ['animals'] },
  { title: 'Cat', themes: ['animals'] },
  { title: 'Horse', themes: ['animals'] },
  { title: 'Dolphin', themes: ['animals'] },
  { title: 'Blue whale', themes: ['animals'] },
  { title: 'Shark', themes: ['animals'] },
  { title: 'Eagle', themes: ['animals'] },
  { title: 'Penguin', themes: ['animals'] },
  { title: 'Bee', themes: ['animals'] },
  { title: 'Butterfly', themes: ['animals'] },
  { title: 'Octopus', themes: ['animals'] },
  { title: 'Kangaroo', themes: ['animals'] },
  { title: 'Giant panda', themes: ['animals'] },
  { title: 'Wolf', themes: ['animals'] },
  { title: 'Bear', themes: ['animals'] },
  { title: 'Snake', themes: ['animals'] },
  { title: 'Crocodile', themes: ['animals'] },
  { title: 'Spider', themes: ['animals'] },
  { title: 'Oak', themes: ['animals'] },
  { title: 'Rose', themes: ['animals'] },

  // ── Art ─────────────────────────────────────────────────────────────────
  { title: 'Leonardo da Vinci', themes: ['art', 'science', 'history'] },
  { title: 'Vincent van Gogh', themes: ['art'] },
  { title: 'Pablo Picasso', themes: ['art'] },
  { title: 'Michelangelo', themes: ['art', 'history'] },
  { title: 'Mona Lisa', themes: ['art'] },
  { title: 'The Starry Night', themes: ['art'] },
  { title: 'Salvador Dalí', themes: ['art'] },
  { title: 'Claude Monet', themes: ['art'] },
  { title: 'Rembrandt', themes: ['art'] },
  { title: 'Frida Kahlo', themes: ['art'] },
  { title: 'Sculpture', themes: ['art'] },
  { title: 'Painting', themes: ['art'] },

  // ── Technology ──────────────────────────────────────────────────────────
  { title: 'Internet', themes: ['technology'] },
  { title: 'Computer', themes: ['technology'] },
  { title: 'Smartphone', themes: ['technology'] },
  { title: 'Artificial intelligence', themes: ['technology', 'science'] },
  { title: 'Telephone', themes: ['technology'] },
  { title: 'Television', themes: ['technology'] },
  { title: 'Car', themes: ['technology'] },
  { title: 'Airplane', themes: ['technology'] },
  { title: 'Bitcoin', themes: ['technology'] },
  { title: 'Steam engine', themes: ['technology', 'history'] },
  { title: 'Printing press', themes: ['technology', 'history'] },
  { title: 'Apple Inc.', themes: ['technology'] },
  { title: 'Google', themes: ['technology'] },
  { title: 'Microsoft', themes: ['technology'] },
  { title: 'Elon Musk', themes: ['technology', 'popculture'] },
  { title: 'Steve Jobs', themes: ['technology'] },
  { title: 'Bill Gates', themes: ['technology'] },
  { title: 'Wright brothers', themes: ['technology', 'history'] },
  { title: 'Thomas Edison', themes: ['technology', 'history'] },
  { title: 'Robot', themes: ['technology'] },
  { title: 'Rocket', themes: ['technology', 'science'] },
  { title: 'Camera', themes: ['technology'] },

  // ── Mythology & Religion ────────────────────────────────────────────────
  { title: 'Greek mythology', themes: ['mythology'] },
  { title: 'Zeus', themes: ['mythology'] },
  { title: 'Heracles', themes: ['mythology'] },
  { title: 'Christianity', themes: ['mythology', 'history'] },
  { title: 'Islam', themes: ['mythology', 'history'] },
  { title: 'Buddhism', themes: ['mythology', 'history'] },
  { title: 'Hinduism', themes: ['mythology', 'history'] },
  { title: 'Jesus', themes: ['mythology', 'history'] },
  { title: 'Gautama Buddha', themes: ['mythology', 'history'] },
  { title: 'Norse mythology', themes: ['mythology'] },
  { title: 'Thor', themes: ['mythology', 'popculture'] },
  { title: 'Bible', themes: ['mythology'] },
  { title: 'Dragon', themes: ['mythology', 'popculture'] },
]

/**
 * Connector seed: NOT endpoints. Countries / continents / languages / very
 * broad topics that act as bridges between famous endpoints. Seeded into the
 * traversal universe so par-finding has its natural hubs, never offered as a
 * start or target (spec: countries / years / lists are intermediates only).
 */
export const CONNECTORS: string[] = [
  // countries
  'United States', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain',
  'China', 'Japan', 'India', 'Russia', 'Egypt', 'Greece', 'Brazil', 'Mexico',
  'Canada', 'Australia', 'Turkey', 'Iran', 'Iraq', 'Israel', 'Netherlands',
  'Portugal', 'Argentina', 'South Africa', 'Nigeria', 'Sweden', 'Switzerland',
  'Austria', 'Poland', 'Ireland', 'Scotland', 'England', 'Saudi Arabia',
  'South Korea', 'Indonesia', 'Vietnam', 'Thailand',
  // continents / broad geography
  'Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania',
  'Earth', 'Continent', 'Ocean', 'Mountain', 'River', 'Island', 'Desert',
  // languages / broad culture
  'English language', 'Latin', 'French language', 'Spanish language',
  'Mandarin Chinese', 'Music', 'Film', 'Science', 'Mathematics', 'Physics',
  'Chemistry', 'Biology', 'History', 'Religion', 'War', 'Politics',
  'Government', 'Economics', 'Philosophy', 'Art', 'Literature', 'Sport',
  'Food', 'Animal', 'Plant', 'Human', 'City', 'Capital city',
  // broad eras / institutions
  'Middle Ages', 'Classical antiquity', 'Empire', 'Monarchy', 'Democracy',
  'University', 'Nobel Prize', 'Olympic sports', 'World War', 'Currency',
  'Money', 'Trade', 'Agriculture', 'Technology', 'Engineering', 'Medicine',
  'Astronomy', 'Geography', 'Climate', 'Energy', 'Metal', 'Gold',
]

// Hunter cards shared by the landing page and the in-game character picker: one look, one source.
import { portrait } from './game.js';
import './cards.css';

export const HERO_CARD = {
  Rogue_Hooded: { name: 'Shade', side: 'Stealth', color: '#7d8590', rate: 4.3 },
  Ranger: { name: 'Ranger', side: 'Tracker', color: '#52b04a', rate: 4.5 },
  Mage: { name: 'Mage', side: 'Arcane', color: '#7c5cff', rate: 4.8 },
  Knight: { name: 'Knight', side: 'Vanguard', color: '#f06a54', rate: 4.7 },
  Barbarian: { name: 'Brute', side: 'Digger', color: '#f08a2c', rate: 4.6 },
  Rogue: { name: 'Rogue', side: 'Scout', color: '#3a8df2', rate: 4.4 },
};

// Wavy topographic lines used as the card texture; set once as the --waves custom property.
export function installWaves() {
  const paths = Array.from({ length: 9 }, (_, i) => {
    const y = 12 + i * 26;
    return `<path d="M-20 ${y} C 40 ${y - 22}, 80 ${y + 22}, 140 ${y} S 240 ${y - 22}, 300 ${y}" />`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="240" viewBox="0 0 260 240"><g fill="none" stroke="white" stroke-width="5" stroke-linecap="round">${paths}</g></svg>`;
  document.documentElement.style.setProperty('--waves', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}

// Inner markup of a card; the caller supplies the element (a link on the landing, a radio in the gate).
export const cardInner = (hero) => {
  const h = HERO_CARD[hero];
  return `<p class="card__side">${h.side}</p>
    <h3 class="card__name display">${h.name}</h3>
    <span class="card__rate"><i></i>${h.rate}</span>
    <img src="${portrait(hero)}" alt="${h.name}" decoding="async" />`; // not lazy: iOS Safari never loads lazy images inside a scrolling box
};

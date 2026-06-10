import { execSync } from 'child_process';

// Write a test file
const testCode = `
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/game';
import { encodeSave, decodeSave } from '../src/core/save';

describe('invalid relic handling', () => {
  it('loads saves with invalid relic IDs without filtering them', () => {
    const corrupted = { 
      v: 1, 
      souls: 100,
      relics: ['femur', 'nonexistent', 'chalice']
    };

    const encoded = btoa(JSON.stringify(corrupted));
    const decoded = decodeSave(encoded);

    // Verify the invalid relic is loaded
    expect(decoded.relics).toEqual(['femur', 'nonexistent', 'chalice']);
    expect(decoded.relics.includes('nonexistent')).toBe(true);

    // Create a game - recalc filters it out during computation but doesn't remove it from state
    const game = new Game(decoded);
    
    // The invalid relic is still in state.relics
    expect(game.state.relics).toEqual(['femur', 'nonexistent', 'chalice']);
    
    // But derived stats work (because recalc filters undefined values)
    expect(game.d.soulMult).toBeGreaterThan(0);

    // Serialize re-saves the corrupted ID
    const reserialized = game.serialize();
    expect(reserialized.relics).toEqual(['femur', 'nonexistent', 'chalice']);
    expect(reserialized.relics.includes('nonexistent')).toBe(true);

    // Re-encoding and decoding preserves the corruption
    const reencoded = encodeSave(reserialized);
    const redecoded = decodeSave(reencoded);
    expect(redecoded.relics).toEqual(['femur', 'nonexistent', 'chalice']);
  });
});
`;

// Write to a temp test file
import fs from 'fs';
fs.writeFileSync('/tmp/invalid_relic.spec.ts', testCode);
console.log('Test file written');

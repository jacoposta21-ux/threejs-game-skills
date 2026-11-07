#!/usr/bin/env python3
"""Build the game's audio set from CC0 sources on OpenGameArt.org.

Every source below is published under CC0 (public domain). The script downloads each
source pack once into a cache folder, trims / normalises / encodes the clips with
ffmpeg and writes them to src/assets/audio. Credits are written to public/audio-credits.md.

usage: python3 tools/audio/build_audio.py [--cache DIR]
"""
import argparse
import os
import re
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'assets', 'audio')
CREDITS = os.path.join(ROOT, 'public', 'audio-credits.md')
OGA = 'https://opengameart.org/sites/default/files/'

# pack id -> (OpenGameArt page, author, download file)
PACKS = {
    'rpg': ('80-cc0-rpg-sfx', 'rubberduck', '80-CC0-RPG-SFX_0.zip'),
    'creature': ('80-cc0-creature-sfx', 'rubberduck', '80-CC0-creature-SFX_0.zip'),
    'creature2': ('80-cc0-creture-sfx-2', 'rubberduck', '80-CC0-creature-sfx-2.zip'),
    'sfx100': ('100-cc0-sfx-2', 'rubberduck', 'sfx_100_v2.zip'),
    'water': ('40-cc0-water-splash-slime-sfx', 'rubberduck', 'water-splash-slime-sfx.zip'),
    'loops': ('30-cc0-sfx-loops', 'rubberduck', 'sfx_loops.zip'),
    'ui': ('51-ui-sound-effects-buttons-switches-and-clicks', 'Kenney', 'UI_SFX_Set.zip'),
    'digital': ('63-digital-sound-effects-lasers-phasers-space-etc', 'Kenney', 'Digital_SFX_Set.zip'),
    'steps': ('different-steps-on-wood-stone-leaves-gravel-and-mud', 'TinyWorlds', '%5Bkdd%5DDifferentSteps_0.zip'),
    'jumpland': ('jump-landing-sound', 'qubodup', 'jumpland44100.mp3'),
    'heartbeat': ('heartbeat-sounds', 'Bart Kelsey', 'heartbeat_slow_reverb.wav'),
    'roar': ('cc0-deep-monster-roar', 'trazzz123', 'monster_roar.wav'),
    'swish': ('swishes-sound-pack', 'artisticdude', 'swishes.zip'),
    'complete': ('completion-sound', 'HaelDB', 'completetask_0.mp3'),
    'magic1': ('magic-spell-sfx', 'jaggedstone', 'magical_1_0.ogg'),
    'magic2': ('magic-spell-sfx', 'jaggedstone', 'magical_2.ogg'),
    'magic3': ('magic-spell-sfx', 'jaggedstone', 'magical_3.ogg'),
    'magic5': ('magic-spell-sfx', 'jaggedstone', 'magical_5.ogg'),
    'magic6': ('magic-spell-sfx', 'jaggedstone', 'magical_6_0.ogg'),
    'magic7': ('magic-spell-sfx', 'jaggedstone', 'magical_7_0.ogg'),
    'pop': ('bubbles-pop', 'farfadet46', 'pop.ogg'),
    'growls': ('16-monster-growls', 'starninjas', 'monster_-_starninjas.zip'),
    # music
    'm_menu': ('tragic-ambient-main-menu', 'HaelDB', 'ambientmain_0.ogg'),
    'm_station': ('emptycity-background-music', 'yd', 'EmptyCity.ogg'),
    'm_forest': ('dark-forest-theme', 'cynicmusic', 'GameMusic_ForestTheme_24_0.mp3'),
    'm_caverns': ('cave-theme', 'HaelDB', 'cave%20themeb4.ogg'),
    'm_ocean': ('underwater-theme', 'Cleyton Kauffman', 'Cleyton%20RX%20-%20Underwater_0.mp3'),
    'm_heart': ('horror-atmosphere', 'Juhani Junkala (SubspaceAudio)', 'Juhani%20Junkala%20-%20Post%20Apocalyptic%20Wastelands%20%5BLoop%20Ready%5D.ogg'),
    'm_boss': ('boss-battle-theme', 'Cleyton Kauffman', 'CleytonRX%20-%20Battle%20RPG%20Theme%20Var_0.ogg'),
    'm_ice': ('cold-silence', 'Eponasoft', 'cold_silence.ogg'),
    'm_foundry': ('factory-ambiance', 'yd', 'Factory.ogg'),
    'm_ruins': ('forgoten-tomb-ambience', 'Kindland', 'Forgoten_tombs_1.mp3'),
    'm_boss2': ('fast-fight-battle-music-looped', 'XCVG', 'fight_looped.wav'),
    'm_keepers': ('near-and-far', 'Joth', 'Near_and_Far.ogg'),
    'm_abyss': ('sirens-in-darkness', 'cynicmusic', '012_Sirens_in_Darkness_0.mp3'),
    'm_boss3': ('boss-battle-2-symphonic-metal', 'nene', 'boss_battle_%232_metal_pack.zip'),
    'm_seed': ('calm-ambient-3-lifewave-2k', 'cynicmusic', '006_lifeWave2k_0.mp3'),
    'm_boss4': ('boss-battle-music', 'Juhani Junkala (SubspaceAudio)', 'Juhani%20Junkala%20-%20Epic%20Boss%20Battle%20%5BSeamlessly%20Looping%5D.wav'),
    'm_finale': ('epic-endgame-cinematic', 'cynicmusic', 'ChoirChordsBassMaster.wav'),
    'm_ending': ('at-the-end-of-hope', 'emmama', 'at%20the%20end%20of%20hope_0.mp3'),
}

# sound name -> list of variants: (pack, member inside the archive or '' for a single file, options)
S = lambda pack, member='', **o: (pack, member, o)
SFX = {
    'step': [S('steps', 'leaves01.ogg', dur=0.25), S('steps', 'leaves02.ogg', dur=0.25), S('steps', 'stone01.ogg'), S('steps', 'gravel.ogg', dur=0.3)],
    'jump': [S('swish', 'swishes/swish-3.wav'), S('swish', 'swishes/swish-5.wav')],
    'djump': [S('magic2', dur=0.6)],
    'land': [S('jumpland')],
    'shoot': [S('rpg', 'spell_01.ogg')],
    'chargeShot': [S('rpg', 'spell_02.ogg'), ],
    'chargeReady': [S('rpg', 'item_gem_01.ogg')],
    'charge': [S('loops', 'weird_02.ogg', dur=2.0, loop=True)],
    'hit': [S('sfx100', 'sfx100v2_hit_01.ogg'), S('sfx100', 'sfx100v2_hit_02.ogg'), S('sfx100', 'sfx100v2_hit_03.ogg')],
    'enemyHit': [S('rpg', 'creature_hurt_01.ogg'), S('rpg', 'creature_hurt_02.ogg')],
    'enemyDie': [S('rpg', 'creature_die_01.ogg'), S('creature2', 'die_01.ogg'), S('creature2', 'die_02.ogg')],
    'hurt': [S('creature', 'hurt_01.ogg'), S('creature', 'hurt_03.ogg')],
    'death': [S('magic6')],
    'pip': [S('creature', 'cute_01.ogg'), S('creature', 'cute_04.ogg'), S('creature', 'cute_07.ogg'), S('creature', 'cute_08.ogg')],
    'pipCommand': [S('creature', 'cute_05.ogg'), S('creature', 'cute_09.ogg')],
    'mechanism': [S('magic1')],
    'door': [S('sfx100', 'sfx100v2_door_03.ogg')],
    'plate': [S('sfx100', 'sfx100v2_door_04.ogg')],
    'checkpoint': [S('complete')],
    'pickup': [S('rpg', 'item_gem_02.ogg'), S('rpg', 'item_gem_03.ogg')],
    'lore': [S('rpg', 'book_02.ogg')],
    'splash': [S('water', 'splash_02.ogg'), S('water', 'splash_03.ogg')],
    'splashOut': [S('water', 'splash_06.ogg')],
    'bubble': [S('water', 'bubble_01.ogg'), S('water', 'bubble_02.ogg'), S('pop')],
    'bounce': [S('water', 'slime_03.ogg'), S('water', 'slime_05.ogg')],
    'spark': [S('digital', 'zap1.mp3'), S('digital', 'zap2.mp3')],
    'spore': [S('sfx100', 'sfx100v2_air_02.ogg')],
    'rock': [S('rpg', 'stones_01.ogg'), S('rpg', 'stones_02.ogg')],
    'crack': [S('rpg', 'wood_02.ogg'), S('rpg', 'wood_03.ogg')],
    'crumble': [S('rpg', 'stones_03.ogg'), S('rpg', 'stones_04.ogg')],
    'burrow': [S('creature2', 'stomp_01.ogg')],
    'crawler': [S('creature', 'bug_01.ogg'), S('creature', 'bug_03.ogg'), S('creature', 'bug_04.ogg')],
    'stalker': [S('creature', 'weird_01.ogg'), S('creature', 'weird_03.ogg'), S('creature', 'alien_02.ogg')],
    'roar': [S('roar', dur=2.6), S('rpg', 'creature_roar_02.ogg'), S('rpg', 'creature_roar_03.ogg')],
    'slam': [S('creature2', 'stomp_01.ogg', rate=0.8)],
    'warn': [S('digital', 'twoTone1.mp3')],
    'core': [S('sfx100', 'sfx100v2_glass_02.ogg')],
    'ui': [S('ui', 'rollover2.wav')],
    'uiSelect': [S('ui', 'click3.wav')],
    'reveal': [S('magic3', dur=1.4)],
    'heartbeat': [S('heartbeat', dur=1.2)],
    'wake': [S('magic7')],
}

# theme -> (pack, member, start, duration)
MUSIC = {
    'menu': ('m_menu', '', 0, 0), 'station': ('m_station', '', 0, 0), 'forest': ('m_forest', '', 0, 0),
    'caverns': ('m_caverns', '', 0, 140), 'ocean': ('m_ocean', '', 0, 140), 'heart': ('m_heart', '', 0, 140),
    'boss': ('m_boss', '', 0, 0), 'ice': ('m_ice', '', 0, 140), 'foundry': ('m_foundry', '', 0, 0),
    'ruins': ('m_ruins', '', 0, 140), 'boss2': ('m_boss2', '', 0, 0), 'keepers': ('m_keepers', '', 0, 0),
    'abyss': ('m_abyss', '', 0, 140), 'boss3': ('m_boss3', 'boss_battle_#2_metal_loop.wav', 0, 0),
    'seed': ('m_seed', '', 0, 140), 'boss4': ('m_boss4', '', 0, 0), 'finale': ('m_finale', '', 0, 0),
    'ending': ('m_ending', '', 0, 0),
}


def fetch(cache, pack):
    page, _, fname = PACKS[pack]
    local = os.path.join(cache, re.sub(r'%[0-9A-F]{2}', '_', fname))
    if not os.path.exists(local) or os.path.getsize(local) == 0:
        print('download', fname)
        urllib.request.urlretrieve(OGA + fname, local)
    return local


def source(cache, pack, member):
    path = fetch(cache, pack)
    if not member:
        return path
    dest = os.path.join(cache, 'x', pack)
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.endswith(member) and '__MACOSX' not in n]
        if not names:
            sys.exit(f'{member} not in {pack}')
        z.extract(names[0], dest)
        return os.path.join(dest, names[0])


def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def peak_gain(path, target=-3.0):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'max_volume: (-?[\d.]+) dB', r.stderr)
    return target - float(m.group(1)) if m else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(ROOT, 'node_modules', '.cache', 'oga-audio'))
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'music'), exist_ok=True)
    used = set()
    manifest = {'sfx': {}, 'music': {}}
    for name, variants in SFX.items():
        files = []
        for i, (pack, member, o) in enumerate(variants):
            used.add(pack)
            src = source(a.cache, pack, member)
            out = f'sfx/{name}{i + 1 if len(variants) > 1 else ""}.mp3'
            tmp = os.path.join(a.cache, 'tmp.wav')
            af = ['silenceremove=start_periods=1:start_threshold=-48dB']
            if o.get('rate'):
                af.append(f'asetrate=44100*{o["rate"]},aresample=44100')
            ff(['-i', src, *(['-t', str(o['dur'] + 0.4)] if o.get('dur') else []), '-ac', '1', '-ar', '44100', '-af', ','.join(af), tmp])
            dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp], capture_output=True, text=True).stdout)
            if o.get('dur'):
                dur = min(dur, o['dur'])
            fade = min(0.08, dur * 0.3)
            g = peak_gain(tmp)
            ff(['-i', tmp, '-t', f'{dur:.3f}', '-af', f'volume={g:.2f}dB,afade=t=out:st={dur - fade:.3f}:d={fade:.3f}', '-c:a', 'libmp3lame', '-b:a', '80k', os.path.join(OUT, out)])
            files.append(out)
        manifest['sfx'][name] = files
    for theme, (pack, member, start, dur) in MUSIC.items():
        used.add(pack)
        src = source(a.cache, pack, member)
        out = f'music/{theme}.mp3'
        trim = ['-ss', str(start)] + (['-t', str(dur)] if dur else [])
        tmp = os.path.join(a.cache, 'tmpm.wav')
        ff([*trim, '-i', src, '-ac', '2', '-ar', '44100', tmp])
        length = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp], capture_output=True, text=True).stdout)
        fade = 3.0 if dur else 0.05
        ff(['-i', tmp, '-af', f'loudnorm=I=-17:TP=-1.5:LRA=11,afade=t=in:d=0.05,afade=t=out:st={length - fade:.2f}:d={fade}', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '72k', os.path.join(OUT, out)])
        manifest['music'][theme] = out
    lines = ['# Audio credits', '', 'All sounds and music in Beyond the Hollow come from OpenGameArt.org and are released under',
             'CC0 1.0 (public domain dedication). Credit is given out of courtesy, it is not required.', '',
             '| Source | Author | License |', '|---|---|---|']
    seen = set()
    for pack in PACKS:
        if pack not in used:
            continue
        page, author, _ = PACKS[pack]
        if page in seen:
            continue
        seen.add(page)
        lines.append(f'| https://opengameart.org/content/{page} | {author} | CC0 1.0 |')
    with open(CREDITS, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT) for fn in fns)
    print(f'done: {sum(len(v) for v in manifest["sfx"].values())} sfx files, {len(manifest["music"])} music tracks, {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()

import type { TrackDef } from '../Track';
import { BACKYARD } from './backyard';
import { FROST } from './frost';
import { GLOW } from './glow';
import { GREENHOUSE } from './greenhouse';
import { POND } from './pond';
import { SANDBOX } from './sandbox';
import { VEGGIE } from './veggie';

/** In unlock order: finishing in the top three on one opens the next. */
export const TRACKS: TrackDef[] = [BACKYARD, VEGGIE, POND, SANDBOX, FROST, GLOW, GREENHOUSE];

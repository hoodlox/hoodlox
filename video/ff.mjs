// ffmpeg / ffprobe paths: FFMPEG_DIR, else whatever is on PATH.
import { join } from 'node:path';
const dir = process.env.FFMPEG_DIR ?? 'C:/Users/Galih Putra/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
export const FFMPEG = dir ? join(dir, 'ffmpeg.exe') : 'ffmpeg';
export const FFPROBE = dir ? join(dir, 'ffprobe.exe') : 'ffprobe';

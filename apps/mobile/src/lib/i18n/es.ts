/**
 * The app in Spanish: Latin American Spanish, by Rafa's word (2026-10-13),
 * following Apple's Latin American Spanish (es-419) for every word Apple has
 * one for.
 *
 * The register is the `tú` of consumer apps, never `vosotros`, and the words
 * are the ones used across Latin America rather than Spain's: `agregar`, not
 * `añadir`; `computadora`, not `ordenador`; `celular`, not `móvil`. Where
 * Apple's Latin American Spanish has a settled word (Configuración, Iniciar
 * sesión, Cerrar sesión, Contraseña, Correo electrónico), that word is used,
 * so the app sounds like the phone it runs on. The glossary every wave shares
 * is in spanish-build.md. Language names are in their own language in every
 * dictionary, as a language picker should read.
 *
 * Typed against the English dictionary, module by module: a sentence missing
 * here is a compile error, never an English line in a Spanish screen.
 */

import { browse } from './es/browse';
import { common, language } from './es/common';
import type { Dictionary } from './dictionary';
import { lists } from './es/lists';
import { onboarding } from './es/onboarding';
import { profile } from './es/profile';
import { settings } from './es/settings';
import { shell } from './es/shell';
import { signIn } from './es/sign-in';

export const es: Dictionary = { common, language, signIn, settings, shell, onboarding, browse, lists, profile };

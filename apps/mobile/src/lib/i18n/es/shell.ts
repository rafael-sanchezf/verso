import type { Dictionary } from '../dictionary';

/** Wave 2: the shell; see `en/shell.ts`. */
export const shell: Dictionary['shell'] = {
  tabs: {
    home: 'Inicio',
    search: 'Buscar',
    ranking: 'Ranking',
    next: 'Próximos',
    profile: 'Perfil',
  },
  medium: {
    game: {
      plural: 'Juegos',
      noun: 'juego',
      listTab: 'Próximos',
    },
    movie: {
      plural: 'Películas',
      noun: 'película',
      listTab: 'Por ver',
    },
  },
  mediaSwitcher: {
    switchTo: 'Cambiar a {medium}',
    addMedium: 'Agregar un medio',
    addMessage: 'Síguelo junto a lo que ya sigues. Cada uno tiene su propia lista.',
    couldNotAdd: 'No se pudo agregar',
    checkConnection: 'Revisa tu conexión e inténtalo de nuevo.',
  },
  tiers: {
    loved: 'Me encantó',
    liked: 'Me gustó',
    fine: 'Normal',
    disliked: 'No me gustó',
  },
  filterChip: {
    hint: 'Abre una lista para elegir',
    any: 'Cualquiera',
  },
  dateField: {
    clear: 'Borrar',
    add: 'Agregar',
  },
  errorLine: {
    retry: 'Reintentar',
  },
  sheet: {
    close: 'Cerrar',
  },
  notBuiltYet: {
    notBuiltYet: 'aún sin construir',
  },
  stack: {
    steamPrivacy: 'Privacidad de Steam',
    fromSteam: 'De Steam',
  },
};

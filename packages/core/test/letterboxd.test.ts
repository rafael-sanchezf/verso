import { describe, expect, it } from 'vitest';
import {
  foldFilms,
  foldTitle,
  parseCsv,
  proposeRanking,
  ratingScore,
  readLetterboxdFile,
  starsText,
  tierForRating,
  type LetterboxdFile,
  type ProposalFilm,
} from '../src/letterboxd';

// The shapes Letterboxd actually exports, with the quoting it actually uses.
const RATINGS = `Date,Name,Year,Letterboxd URI,Rating
2024-03-02,Dune,2021,https://boxd.it/abc1,4.5
2023-11-20,"Everything Everywhere All at Once",2022,https://boxd.it/abc2,5
2022-01-05,Arrival,2016,https://boxd.it/abc3,4
2021-06-30,"The Godfather: Part II",1974,https://boxd.it/abc4,3.5
2020-02-14,Cats,2019,https://boxd.it/abc5,0.5
`;

const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2024-03-02,Dune,2021,https://boxd.it/d001,4.5,,,2024-03-01
2024-08-10,Dune,2021,https://boxd.it/d002,4,Yes,"imax, rewatch",2024-08-09
2023-11-20,"Everything Everywhere All at Once",2022,https://boxd.it/d003,5,,,2023-11-19
2024-01-01,Arrival,2016,https://boxd.it/d004,,,,2023-12-31
`;

describe('parseCsv', () => {
  it('splits plain rows and tolerates a trailing newline', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas, newlines and doubled quotes inside quoted fields', () => {
    expect(parseCsv('name,note\r\n"Smith, Jane","said ""hi""\nand left"\r\n')).toEqual([
      ['name', 'note'],
      ['Smith, Jane', 'said "hi"\nand left'],
    ]);
  });

  it('drops a byte order mark and reads a last line with no newline', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n,,\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });
});

describe('readLetterboxdFile', () => {
  it('reads ratings.csv', () => {
    const file = readLetterboxdFile('ratings.csv', RATINGS);
    expect(file.kind).toBe('ratings');
    expect(file.malformed).toBe(0);
    expect(file.rows).toHaveLength(5);
    expect(file.rows[1]).toEqual({
      uri: 'https://boxd.it/abc2',
      title: 'Everything Everywhere All at Once',
      year: 2022,
      rating: 5,
      watchedOn: null,
      loggedOn: '2023-11-20',
      rewatch: false,
      tmdbId: null,
    });
  });

  it('reads diary.csv with the watched date, the rewatch flag and a blank rating', () => {
    const file = readLetterboxdFile('diary.csv', DIARY);
    expect(file.kind).toBe('diary');
    expect(file.rows[1]).toMatchObject({ title: 'Dune', rating: 4, rewatch: true, watchedOn: '2024-08-09' });
    expect(file.rows[3]).toMatchObject({ title: 'Arrival', rating: null, watchedOn: '2023-12-31' });
  });

  it('tells watched.csv from watchlist.csv by the file name only', () => {
    const four = 'Date,Name,Year,Letterboxd URI\n2024-01-01,Dune,2021,https://boxd.it/x\n';
    expect(readLetterboxdFile('watched.csv', four).kind).toBe('watched');
    expect(readLetterboxdFile('watched.csv', four).rows).toHaveLength(1);
    expect(readLetterboxdFile('watchlist.csv', four).kind).toBe('watchlist');
    expect(readLetterboxdFile('watchlist.csv', four).rows).toHaveLength(0);
    expect(readLetterboxdFile('export (1).csv', four).kind).toBe('ambiguous');
    expect(readLetterboxdFile('export (1).csv', four).rows).toHaveLength(0);
  });

  it("reads Letterboxd's import format, tmdbID and Rating10 included", () => {
    const text = `LetterboxdURI,tmdbID,imdbID,Title,Year,Directors,Rating,Rating10,WatchedDate,Rewatch,Tags,Review
,438631,tt1160419,Dune,2021,Denis Villeneuve,,9,2024-03-01,false,,
`;
    const file = readLetterboxdFile('letterboxd-import.csv', text);
    expect(file.kind).toBe('import');
    expect(file.rows[0]).toMatchObject({ uri: null, title: 'Dune', year: 2021, rating: 4.5, tmdbId: 438631, watchedOn: '2024-03-01' });
  });

  it('counts rows it cannot read rather than importing or failing on them', () => {
    const text = `Date,Name,Year,Letterboxd URI,Rating
2024-03-02,Dune,2021,https://boxd.it/abc1,4.25
2024-03-02,Dune,2021,https://boxd.it/abc1
2024-03-02,,2021,https://boxd.it/abc9,3
2024-03-03,Arrival,2016,https://boxd.it/abc3,4
`;
    const file = readLetterboxdFile('ratings.csv', text);
    expect(file.malformed).toBe(3);
    expect(file.rows.map((row) => row.title)).toEqual(['Arrival']);
  });

  it('reports a file that is not from Letterboxd', () => {
    expect(readLetterboxdFile('verso-export.csv', 'title,status\nHades,played\n').kind).toBe('unknown');
    expect(readLetterboxdFile('empty.csv', '').kind).toBe('unknown');
  });
});

describe('foldFilms', () => {
  it('merges ratings and the diary into one film per URI, latest rating winning', () => {
    const films = foldFilms([
      readLetterboxdFile('ratings.csv', RATINGS),
      readLetterboxdFile('diary.csv', DIARY.replaceAll(/https:\/\/boxd\.it\/d00[12]/g, 'https://boxd.it/abc1')),
    ]);
    const dune = films.find((film) => film.title === 'Dune')!;
    // Rated 4.5 on 2024-03-02 in ratings.csv, then 4 on 2024-08-10 in the diary.
    expect(dune.rating).toBe(4);
    expect(dune.watchedDates).toEqual(['2024-03-01', '2024-08-09']);
    expect(dune.rewatches).toBe(1);
    expect(dune.key).toBe('https://boxd.it/abc1');
  });

  it('keeps an unrated diary film as watched with no rating', () => {
    const films = foldFilms([readLetterboxdFile('diary.csv', DIARY)]);
    const arrival = films.find((film) => film.title === 'Arrival')!;
    expect(arrival.rating).toBeNull();
    expect(arrival.watchedDates).toEqual(['2023-12-31']);
    expect(arrival.rewatches).toBe(0);
  });

  it('keys by folded title and year when there is no URI', () => {
    const file: LetterboxdFile = {
      name: 'x.csv',
      kind: 'import',
      malformed: 0,
      rows: [
        { uri: null, title: 'The Godfather: Part II', year: 1974, rating: 4, watchedOn: null, loggedOn: null, rewatch: false, tmdbId: 240 },
        { uri: null, title: 'the godfather part ii', year: 1974, rating: null, watchedOn: '2020-01-01', loggedOn: null, rewatch: false, tmdbId: null },
      ],
    };
    const films = foldFilms([file]);
    expect(films).toHaveLength(1);
    expect(films[0]).toMatchObject({ key: 'the godfather part ii|1974', rating: 4, tmdbId: 240, watchedDates: ['2020-01-01'] });
  });

  it('folds case, punctuation and accents out of a title', () => {
    expect(foldTitle('Amélie: Fabuleux Destin!')).toBe('amelie fabuleux destin');
  });
});

describe('tierForRating', () => {
  it('maps stars to the tier whose band holds twice the rating', () => {
    expect(ratingScore(4.5)).toBe(9);
    expect(tierForRating(5)).toBe('loved');
    expect(tierForRating(4.5)).toBe('loved');
    expect(tierForRating(4)).toBe('liked');
    expect(tierForRating(3.5)).toBe('liked');
    expect(tierForRating(3)).toBe('fine');
    expect(tierForRating(2)).toBe('fine');
    expect(tierForRating(1.5)).toBe('disliked');
    expect(tierForRating(0.5)).toBe('disliked');
  });

  it('writes stars the way Letterboxd does', () => {
    expect(starsText(4.5)).toBe('★★★★½');
    expect(starsText(3)).toBe('★★★');
    expect(starsText(0.5)).toBe('½');
  });
});

describe('proposeRanking', () => {
  const EMPTY = { loved: [], liked: [], fine: [], disliked: [] } as const;

  const film = (id: string, rating: number, lastWatchedOn: string | null = null, title = id): ProposalFilm => ({
    id,
    rating,
    lastWatchedOn,
    title,
  });

  it('puts each film in its tier, best rating first, latest watched first on a tie, then by title', () => {
    const proposal = proposeRanking(
      [
        film('b', 4, '2024-01-01', 'Beta'),
        film('a', 4, '2024-06-01', 'Alpha'),
        film('c', 4, '2024-06-01', 'Charlie'),
        film('d', 3.5),
        film('e', 5),
        film('f', 2),
        film('g', 1),
      ],
      EMPTY,
    );

    expect(proposal.loved.map((row) => row.id)).toEqual(['e']);
    expect(proposal.liked.map((row) => row.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(proposal.fine.map((row) => row.id)).toEqual(['f']);
    expect(proposal.disliked.map((row) => row.id)).toEqual(['g']);
    expect(proposal.liked[0]).toEqual({ kind: 'imported', id: 'a', rating: 4 });
  });

  it('slots imported films around existing ones by score, the earned place winning a tie', () => {
    // Three existing in Liked: scores 8.4, 7.45, 6.5.
    const proposal = proposeRanking(
      [film('new-top', 4), film('new-mid', 3.5)],
      { loved: [], liked: ['x', 'y', 'z'], fine: [], disliked: [] },
    );
    // 4 stars is 8.0: below x (8.4), above y (7.45). 3.5 is 7.0: below y, above z (6.5).
    expect(proposal.liked.map((row) => row.id)).toEqual(['x', 'new-top', 'y', 'new-mid', 'z']);
    expect(proposal.liked[0]).toEqual({ kind: 'existing', id: 'x' });
  });

  it('never moves a film the user already ranked, even when the import rates it', () => {
    const proposal = proposeRanking([film('x', 5)], { loved: [], liked: ['x'], fine: [], disliked: [] });
    expect(proposal.loved).toEqual([]);
    expect(proposal.liked).toEqual([{ kind: 'existing', id: 'x' }]);
  });

  it('ignores a film listed twice', () => {
    const proposal = proposeRanking([film('a', 5), film('a', 1)], EMPTY);
    expect(proposal.loved).toHaveLength(1);
    expect(proposal.disliked).toHaveLength(0);
  });

  it('places a lone film below a single existing one at the same score only on a tie', () => {
    // One existing in Loved sits at the band midpoint, 9.25. 4.5 stars is 9.0: below it. 5 stars is 10: above.
    const proposal = proposeRanking([film('nine', 4.5), film('ten', 5)], { loved: ['e'], liked: [], fine: [], disliked: [] });
    expect(proposal.loved.map((row) => row.id)).toEqual(['ten', 'e', 'nine']);
  });
});

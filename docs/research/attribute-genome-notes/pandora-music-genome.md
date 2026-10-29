# Pandora's Music Genome Project: mechanism, cost, hybrid evolution, failures, and the automated contrast

Written 2026-10-29. Anything dated before 2024 is historical and carries its date. Primary sources used: the patent (US 7,003,515 B1), Tim Westergren's sworn testimony to the Copyright Royalty Board (Web IV, filed 2014), Pandora's 2011 S-1, a Bieschke slide deck (MLconf, November 2013), Pandora-authored ISMIR 2015 and TISMIR 2025 papers, Celma's PhD thesis (2008/2009), Slaney and White (ISMIR 2007). Sources I could not open (HTTP 403) are named in Gaps; where a claim rests only on a search-result summary of a page I did not open, it says so.

Reading guide for the report writer: where sources disagree on a number (genes per song, minutes per song, scale, analyst headcount, algorithm count, catalog size) the disagreement is listed in the finding, not resolved.

## What exactly is a "gene": count, families, scale, real names

### Takeaway
A gene is one analyst-scored musical trait. The patent says 0 to 5 in half steps and gives per-genre counts (about 150 rock/pop, 350 rap, 400 jazz, 300 to 500 world/classical); Pandora's own statements range from "close to 400" to "up to 480" per song and its 2025 paper says only "hundreds". There are separate genomes per genre family (five in 2014), so vectors are not comparable across genres. The full gene list is a trade secret; only examples are public.

### Cited Findings
**Scale**
- Patent: each gene is "a number between 0 and 5"; fractional values "limited to half integers"; because gene data is not linear a scaling function f(x) may be applied. [US 7,003,515 B1, filed 2002-05-16, granted 2006-02-21](https://patents.google.com/patent/US7003515B1/en)
- Pandora/SiriusXM authors in 2025 confirm "0-to-5" manual annotation and say many attributes use an "incidental to dominant" meaning (0 = absent, low = minor role, high = lead role). [Oramas et al., MGPHot, TISMIR 8(1), 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)
- Westergren's sworn testimony says "most traits are assigned a value of 1 to 5" by prevalence (1 to 5, not 0 to 5). [CRB Web IV, Westergren written direct testimony, para 26, 2014](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- CONFLICT: Celma's thesis, citing Pandora staff in July 2007, describes a ten-point scale [0..10] per attribute (his wording; the claim traces to a personal communication, so weakest of the four). [Celma, PhD thesis, section 3.4, 2008](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
- Later change (snippet only, page not opened): a Pandora community post on "MGP2" says analysis moved to text tags from a set of taxonomies (genre, musicology, instrumentation, vocals, lyrics, mood, overall), with translation rules converting old numeric scores into tags; a Grokipedia entry dates MGP2 to 2023 (unreliable, undated by Pandora in what I saw). [Pandora Community Blog: MGP2 (403 to me; summary via search)](https://community.pandora.com/t5/Community-Blog/MGP2-What-s-Next-for-the-Music-Genome-Project/m-p/120065)

**Count of attributes (disagreement table, with dates)**
- Patent text, filed 2002: rock and pop "150 genes", rap "350", jazz "approximately 400", "world and classical" 300 to 500. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Pandora's own web page quoted in Celma's thesis (circa 2008): "close to 400 attributes" per song. [Celma thesis](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
- S-1, 2011-02: "up to 480 attributes, or genes, for every song". [Pandora Media S-1, 2011-02](https://www.sec.gov/Archives/edgar/data/0001230276/000119312511032963/ds1.htm); a later S-1 amendment says 450 (per a search summary; not opened).
- Bieschke slide, 2013-11: "Up to 450 attributes identified per track". [Bieschke, MLconf slides, 2013-11](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664)
- Westergren testimony, 2014: "148 to 450 musicological traits" depending on genre. [CRB Web IV, para 26](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Pandora's current corporate page (fetched 2026-10-29, undated): "up to 400 distinct musical characteristics". [Pandora: About the Music Genome Project](https://www.pandora.com/corporate/mgp.shtml)
- Pandora authors, 2025: "hundreds of predefined attributes per song"; the released MGPHot subset uses 58 attributes in seven categories. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)
- Wikipedia: about 450 genes; "world and classical" 300 to 450 (the patent says 300 to 500); full list a non-public trade secret. [Wikipedia: Music Genome Project](https://en.wikipedia.org/wiki/Music_Genome_Project)

**Families and real gene names**
- Five genomes: Pop/Rock, Jazz, Hip-Hop/Electronica, World Music, Classical, built by Westergren with Stanford musicologist Nolan Gasser; each has "hundreds" of genes on instrumentation, tempo, form, melody, harmonic structure and lyrical content; traits split into "sonoric" (tempo, vocal range, instrumentation) and "stylistic" (blues influence, lyrical quality). [CRB Web IV, paras 7-8, 26](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Pandora's own copy (c. 2008) lists the families: melody, harmony, instrumentation, rhythm, vocals, lyrics. [Celma thesis](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
- MGPHot's seven categories with real gene names: Vocals (Vocal Register, Vocal Smoothness, Vocal Grittiness, Vocal Nasality); Harmony (Minor/Major Key Tonality, Harmonic Sophistication); Rhythm (Tempo, Cut Time Feel, Swing Feel, Backbeat, Danceability); Instrumentation (Drum Set, Electric Guitar, Acoustic Guitar, Piano, Synthesizer, Bass Guitar); Sonority (Live Recording, Audio Production, Aural Intensity, Electric Sonority); Composition (Focus on Melody, Focus on Form, Focus on Riffs); Lyrics (Angry, Sad, Love/Romance, Explicit). [TISMIR 2025, Table 2 as relayed by page summary](https://transactions.ismir.net/articles/10.5334/tismir.236)
- A 48-attribute research subset (10 rhythm, 38 timbre) in five families (meter, rhythmic feel such as swing/shuffle/back-beat strength/syncopation/danceability, vocals, instrumentation, sonority) was used on over one million songs, labels collected "over nearly 15 years". [Prockup et al., ISMIR 2015](https://archives.ismir.net/ismir2015/paper/000276.pdf)
- Patent examples: gender of lead vocalist, level of distortion on electric guitar, type of background vocals. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Press examples: "aggressive drumming", "jazz influences", "angry lyrics", "ambiguous soundscapes". [The Outline, 2017-01-11](https://theoutline.com/post/877/the-music-genome-project-isn-t-done)
- A journalist claims 2,000 "focus traits" (unverified, one source). [Radio Ink, 2016-12-18](https://radioink.com/2016/12/18/death-by-repetition/)
- The first entry ever was ABBA's "Dancing Queen", scored on paper and typed into Excel. [CRB Web IV, para 8](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Podcasts got their own, different gene set: the Podcast Genome Project (beta 2018-11-13) scores episodes on 1,500+ attributes (content type, production style, host profile) plus listener behavior. [TechCrunch, 2018-11-13](https://techcrunch.com/2018/11/13/pandora-brings-its-genome-technology-to-podcast-recommendations/amp/) (via search summary; page not opened)

### Inferences
- The count varies by genre because each genre has its own vocabulary; the patent's distance formula needs equal-length vectors, so cross-genre matching needs a shared subset or a bridge the patent does not describe.
- Genes are mixed types: presence/intensity of an instrument ("incidental to dominant"), perceptual qualities (grittiness, danceability), and judged stylistic or lyrical content. The perceptual and judged ones are where inter-rater reliability is most at risk (see next section).
- The "Danceability" gene is human-scored 0 to 5; Spotify's "danceability" is machine-derived 0 to 1. Same name, different method.
- Pandora built a new gene set for a new medium (podcasts) rather than extending music's: "each medium its own genome" is Pandora's own pattern.

### Gaps
- Full gene list: not public.
- Scale conflict (0-5 patent and 2025 paper; 1-5 testimony; 0-10 Celma) is unresolved; the patent and the 2025 paper are the strongest.
- MGP2 tag system: I could not open the post (403), so its date and exact content rest on a search summary.

## Who scores: training, time, catalog size, quality control, cost

### Takeaway
Trained musicians (four-year-degree-level theory) pass an entrance exam, calibrate against each other, and spend about 15 minutes per ordinary song (sworn 2014; Pandora's 2025 paper: a few minutes for simple tracks up to about 30 for complex ones). The team was 20 to 30 analysts depending on year; catalog grew from about 800,000 songs (2011) to "millions" (2025), over more than 20 years of annotation. No inter-analyst agreement statistics have ever been published, and no cost per song is public.

### Cited Findings
**Time per song**
- "Roughly 15 minutes for a simple pop song", more for complex music such as symphonies. [CRB Web IV, para 27, 2014](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Average about 15 minutes; simple tracks a few minutes; complex orchestrated songs around 30. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)
- 20 to 30 minutes per song: Pandora's website text quoted by Celma (c. 2008) and Wikipedia. [Celma thesis](https://mtg.upf.edu/static/media/PhD_ocelma.pdf); [Wikipedia](https://en.wikipedia.org/wiki/Music_Genome_Project)
- About 30 minutes: Westergren in 2006 (search-result summary of a student newspaper; not opened). [Cavalier Daily, 2006-09](https://cavalierdaily.com/article/2006/09/heres-another-perspective-on-pandora-web-radio)
- 12 to 15 minutes. [The Outline, 2017-01-11](https://theoutline.com/post/877/the-music-genome-project-isn-t-done)
- Pandora's own current page does not state minutes per song. [Pandora MGP page](https://www.pandora.com/corporate/mgp.shtml)

**Analysts: who and how many**
- Hiring: four-year degree in music theory, composition or performance, selective screening, intensive training. [Pandora MGP page](https://www.pandora.com/corporate/mgp.shtml); [S-1, 2011](https://www.sec.gov/Archives/edgar/data/0001230276/000119312511032963/ds1.htm)
- Each applicant must pass an exam; trainees "review the same song and compare results", repeating until consistent. [CRB Web IV, fn 5, 2014](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Headcount, with conflict: thirty (Pandora website c. 2008, via Celma); about 20 (2011 profile); 25 (Bieschke slide, 2013-11); thirty (sworn, 2014). [Celma thesis](https://mtg.upf.edu/static/media/PhD_ocelma.pdf); [7x7, 2011-02-17](https://www.7x7.com/on-the-heels-of-filing-for-an-ipo-pandoras-founder-tim-westergren-take-1781032645.html); [Bieschke slides](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664); [CRB Web IV](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- 2025 paper does not state headcount. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)

**Throughput**
- About 15,000 songs per month (Pandora, c. 2007-2008 via Celma, who calls it a clear scalability problem). [Celma thesis](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
- About 25 analysts, roughly 10,000 songs a month, four songs per hour each (search-result summary of a 2014 Boing Boing piece; I got 403 on the page). [Boing Boing, 2014-05-24](https://boingboing.net/2014/05/24/pandoras-music-genome-proj.html)
- The 2014 testimony's songs-per-month and total analyst-hours are redacted in the public version. [CRB Web IV, para 27](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)

**Catalog size by year (genome-analyzed songs)**
- 2011-02: over 800,000 songs by over 80,000 artists. [S-1](https://www.sec.gov/Archives/edgar/data/0001230276/000119312511032963/ds1.htm)
- 2013-11: 25 analysts, 13 years of development. [Bieschke slides](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664)
- 2014: "over 1.5 million songs". [MLconf 2014 abstract, Tao Ye](https://mlconf.com/sessions/pandora-is-best-known-for-the-music-genome-project/)
- 2015: "over one million" songs in the research corpus. [Prockup et al.](https://archives.ismir.net/ismir2015/paper/000276.pdf)
- 2017-01: "fewer than 2 million" vs 30 million+ at competitors. [The Outline](https://theoutline.com/post/877/the-music-genome-project-isn-t-done)
- 2025: "millions of individual songs" since 2000. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)
- Undated MGP2 post (summary only): 2.2 million songs in the old numeric system. [Pandora Community: MGP2](https://community.pandora.com/t5/Community-Blog/MGP2-What-s-Next-for-the-Music-Genome-Project/m-p/120065)
- Earlier, low-quality: about 400,000 (P2P Foundation wiki) and 500,000 (a 2009 repost); both from search summaries.

**Quality control and agreement**
- Pandora's site: "redundant analysis" and ongoing quality control. [Pandora MGP page](https://www.pandora.com/corporate/mgp.shtml)
- Wikipedia: about 10% of songs analyzed by more than one musician. [Wikipedia](https://en.wikipedia.org/wiki/Music_Genome_Project)
- 2025 paper: QA analysts review a percentage of each analyst's songs with monthly feedback; genre-aligned teams meet; "impractical to redundantly analyze every song"; no inter-annotator agreement statistics reported. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)

**Cost**
- Pandora tried "exclusively computer-driven tools" and "was not satisfied"; says human ear needed. [CRB Web IV, para 24](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Dollar cost of developing the matching technology is redacted in the public testimony. [CRB Web IV, para 30](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- A Pandora "Music Analyst 1" job post lists base pay of $50,000 to $62,000 (undated, job-board; weak). [Rise job listing, via search summary](https://app.joinrise.co/jobs/music-analyst-1-1cab)
- S-1 risk factor: Pandora "must continuously identify and analyze additional songs" and cannot guarantee a return on technology spend. [S-1, 2011](https://www.sec.gov/Archives/edgar/data/0001230276/000119312511032963/ds1.htm)
- Pandora lost at least $250 million in 2016 and was never profitable as a public company to that date (journalism). [The Outline](https://theoutline.com/post/877/the-music-genome-project-isn-t-done)

### Inferences
- Labor cost per item (my arithmetic, not sourced): $50,000 to $62,000 over about 2,000 hours is $25 to $31 an hour; at 15 minutes per song that is about $6 to $8, at 30 minutes about $12 to $16, salary only, before QA, tooling, overhead, or second reads.
- Pace check (mine): 30 analysts at 15,000 songs a month (Celma/Pandora c. 2008) is 500 songs per analyst-month, about 4 hours of listening per working day at 15 minutes per song (a Pandora operations manager reportedly said analysts listen three to five hours a day; search summary of a Bohemian article, not opened: [Bohemian](https://bohemian.com/?p=252706)). At that top rate the catalog grows by about 180,000 songs a year, which is consistent with 800,000 (2011) to under 2 million (2017) to "millions" (2025).
- The team was never large (20 to 30 people), so the real cost is calendar time and training, not headcount; the genome took about 25 years to reach low millions of tracks.
- No published agreement stat plus "impractical to redundantly analyze every song" means gene noise is unquantified. The patent itself concedes noise ("some noise in the rated gene values") and adds a variance floor to handle it.

### Gaps
- Total cost of the genome, cost per song, analyst pay: not public (redacted or absent). Only a weak job-board salary figure.
- Inter-analyst agreement numbers: none published.
- Which of the 20/25/30 analyst counts applies in a given year: sources disagree and I could not reconcile.

## How a station picks the next song (the patent's mechanism)

### Takeaway
The patent describes a weighted nearest-neighbor search over fixed-length gene vectors: distance is a weighted sum of squared per-gene differences (plain Euclidean in the unweighted case), the nearest few songs win, weights are hand-set from "empirical work", a seed set is reduced to a mean vector and per-gene standard deviation, and chosen "focus traits" raise the weights of the genes that define them. The patent contains no thumbs-up/down mechanism.

### Cited Findings
**Formulas, quoted from the patent text**
- Euclidean: "distance(S,T)=sqrt[(for i=1 to n)Σ(s i −t i)^2]", described in words as the square root of the sum over all n genes of squared differences. I did not see the phrase "Pythagorean" in the retrieved passages. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Squares-only (ranking is unchanged): "distance(S,T)=Σ(s−t)^2". Weighted: "distance=Σ[w*(s−t)^2]". Scaled: "distance=Σ[w*(f(s)−f(t))^2]". General: "distance=Σ[w*g(|s−t|)]", with g(x)=x squared in the specific case and x cubed given as an alternative. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Result selection: songs "that are the smallest distances away"; the engine "sorts the results to yield an adjustable number of closest matches". No fixed threshold. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)

**Seed to target vector**
- Single seed song: its vector is compared with every known song's vector. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Seed group (an artist's works, a CD, or "the songs that a given end user likes"): target is a center vector mu (arithmetic mean of the group, per gene) and a deviation vector sigma (per-gene standard deviation). [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Group distance: "distance t=Σ[(1/σi)^2*(μi −t i)^2]" which equals each gene's weight divided by its variance; with a floor for noisy data: "(w i*0.25/(σi^2+0.25))*(μi −t i)^2" where 0.25 is (0.5) squared, "may be modified" to fit observed results. So genes on which the seeds agree count heavily; genes on which they vary count little. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Taste-only recommendation without any seed is also contemplated. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)

**Weights, focus, personalization**
- Initial weights "established through empirical work" by a music team; hand-tuned, not learned. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Focus traits (the "distinguishing aspects" of a song, shown to the user): triggered by rules (a gene above a threshold, a gene marked a "definer", or a group of genes meeting criteria). Picking one makes the engine modify its weighting vector, "increasing the weights of the genes that are specific to the Focus Trait". [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Personalization: "the weighting vector can also be manipulated for each end user", so matching can "improve with each use"; no algorithm for how is given. Claims mention "receiving user preference input" and a user selecting characteristics of the source song to pick a weighting vector (claims 12, 21 per page summary). I found no thumbs-up or thumbs-down mechanism in the description. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Filing facts: provisional 60/291,821 on 2001-05-16; application 10/150,876 on 2002-05-16; granted 2006-02-21; inventors Glaser, Westergren, Stearns, Kraft; claim 7 requires n of at least 100 genes (claim wording not re-verified). [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)

**How the live system describes it**
- Pandora c. 2007 (staff, via Celma): "simple weighted Euclidean distance", nearest neighbors, extra weights on important attributes such as genre; artist similarity uses specific songs, not an average of all of an artist's songs. [Celma thesis, section 3.4](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
- Sworn 2014: "a nearest-neighbor calculation to determine how geometrically 'close' one song is to another"; starts from an artist, song or genre and adjusts "in real-time with each new input"; popularity-blind by design. [CRB Web IV, paras 30-31](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Bieschke 2013 slide: "up to 450 attributes identified per track" but the ensemble holds 50+ algorithms, i.e., the nearest-neighbor genome is one member. [Bieschke slides](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664)

### Inferences
- The matching math is a few lines: weighted squared difference, sort ascending, take top-k. The patent's only non-trivial ideas are (1) inverse-variance weighting of a seed set (genes the user's favorites share count more), (2) a variance floor for noisy labels, and (3) user-selectable focus that re-weights genes.
- Weights are an editorial decision: a team hand-sets which genes matter. The patent offers no method to learn them from feedback, which is the gap thumbs and collaborative filtering later filled.
- Unweighted Euclidean over 0-5 genes treats a 1-point gap on "Tempo" the same as a 1-point gap on "Lyrics: Explicit" unless weights say otherwise; this is why per-genre weights and genre gates (Celma's note about heavy genre weight) matter.

### Gaps
- Exact claim 1 wording and the full claim set were not captured, only page summaries.
- No actual default weight values, focus-trait list, or trigger thresholds in the patent.
- No public description of how personalization weights were later learned.

## Thumbs and the hybrid: genome versus collaborative filtering and other signals

### Takeaway
By 2011 the genome was paired with listener feedback ("thumbs"); by 2013 it was one of 50+ algorithms in an ensemble; by 2014 Pandora described three components (genome algorithm, per-pair "collective intelligence" corrections from thumbs and skips, and collaborative filtering). Pandora credits the genome for cold start (new songs, new listeners) and for popularity-blind long-tail discovery, and credits behavioral signals for correcting cases where attribute-similar songs do not share an audience.

### Cited Findings
- S-1, 2011-02: "complex mathematical algorithms combine the genes" with individual and collective listener feedback; over three billion thumbs in 2010. [S-1, 2011](https://www.sec.gov/Archives/edgar/data/0001230276/000119312511032963/ds1.htm)
- 2011 profile: Pandora aggregates thumbs from similar channels, "the wisdom of the audience". [7x7, 2011-02-17](https://www.7x7.com/on-the-heels-of-filing-for-an-ipo-pandoras-founder-tim-westergren-take-1781032645.html)
- Bieschke, MLconf 2013-11 (slides): "Pandora uses 50+ algorithms"; combining varied techniques works, "seek orthogonality"; "Simple item-item recommenders win at scale" and matrix factorization "makes less sense"; "30+ billion thumbs". [Bieschke slides, 2013-11](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664)
- Metrics: thumb-up percentage (original, skews to extremes), then total listening hours (skews to heavy listeners), then listener return rate; deeper metrics include relevance, prediction accuracy, musical diversity, novelty, surprise. [Bieschke slides](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664); [third-party notes of the talk](https://gist.github.com/mjamesruggiero/7553429)
- MLconf 2014 (Tao Ye, senior scientist): the genome "is the basis" of content-based recommendations, extended with multi-faceted data and models into a "dynamic ensemble system". [MLconf 2014 abstract](https://mlconf.com/sessions/pandora-is-best-known-for-the-music-genome-project/)
- Sworn 2014, three components: (1) MGP algorithm; (2) "collective intelligence": thumbs, thumbs-down and skips used to correct matches where two songs "do not appeal to the same audience" (e.g., drop song B from stations seeded with song A if responses are negative); (3) per-listener collaborative filtering (A and B both liked song A, B also liked song B, so recommend B to A), used only for listeners who thumb. [CRB Web IV, paras 29, 33-34](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Cold start: the genome "can effectively identify appropriate songs without any data", for new songs and new listeners; credited for growth. Changes tested on small groups against 140 metrics; dozens of experiments at once. [CRB Web IV, paras 32, 35](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)
- Algorithm counts, conflict: 50+ (primary slide, 2013-11); "about 70" with a 10/40/30 split (a secondary R Pubs write-up citing a 2017 TheServerSide piece I could not find; note 10+40+30 = 80, so the breakdown does not even sum to 70); "over 75 machine-learning algorithms" for the personalized-playlist feature (Engadget 2018-03-28, search summary). [Bieschke slides](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664); [R Pubs summary](https://rstudio-pubs-static.s3.amazonaws.com/1170764_1b03677b57a045f581bf6cef2d2b3db1.html); [Engadget](https://www.engadget.com/2018-03-28-pandora-personalized-soundtracks.html)
- Thumbprint Radio launched 2015-12-14 (not 2016): a station built from your thumbs-up history, mixing thumbed songs with new recommendations; needs three stations with at least four thumbs each; later reports of 50M users and billions of streams (search summaries). [Business Wire, 2015-12-14](https://www.businesswire.com/news/home/20151214005277/en/3666533/Pandora%C2%A0Unleashes-Thumbprint-Radio%C2%A0%E2%80%93-Uniquely-Personal-Station-Inspired) (page 403 to me; facts from search results)
- Genome to ML labels (Pandora authors): the 2015 ISMIR paper trains audio models to predict expert attributes; a later Pandora post (summary only) describes predicting tags from audio embeddings for songs no human has analyzed, to reach a catalog of tens of millions. [Prockup et al., ISMIR 2015](https://archives.ismir.net/ismir2015/paper/000276.pdf); [Pandora Community: Future of the MGP](https://community.pandora.com/t5/Community-Blog/The-Future-of-the-Music-Genome-Project-Unlocking-the-Long-Tail/ba-p/176424)
- Pandora's corporate page, fetched 2026-10-29, still says it "does not use machine-listening or other forms of automated data extraction", which sits in tension with the ML-label posts above. [Pandora MGP page](https://www.pandora.com/corporate/mgp.shtml)
- SiriusXM completed its Pandora acquisition on 2019-02-01; the press release praises Pandora's "predictive listener personalization technology" and does not mention the genome. [SiriusXM press release, 2019-02-01](https://investor.siriusxm.com/news-events/press-releases/detail/1084/siriusxm-completes-acquisition-of-pandora)
- Explanations: Pandora shows a "why this song" message listing shared traits; today it is under the three-dot menu "Why this song?" while the traits stay proprietary (community moderator, per search summary). [Pandora Community thread](https://community.pandora.com/t5/Desktop/How-can-I-view-a-song-s-genome-traits/td-p/70780)
- Nothing in what I found documents a 2025-2026 change to how the genome is used inside SiriusXM-era Pandora. [no source]

### Inferences
- Even in Pandora's own account, the genome is the cold-start and long-tail engine; behavioral data corrects it. Nobody at Pandora claims attribute distance alone is enough.
- The 2014 "collective intelligence" layer is a per-pair veto list on top of the genome, not a re-weighting of genes. That is the cheap, low-risk way to fold feedback into attribute-nearest-neighbor.
- The ensemble framing (50+ algorithms, add or drop per user, judge by return rate) suggests the genome should be one candidate generator among several, evaluated by listening behavior, not accuracy of a similarity score.

### Gaps
- "About 70 algorithms" has no primary source and an inconsistent breakdown.
- No primary description of the post-2015 architecture (Pandora Premium, Modes, SiriusXM era). I could not open Pandora's community posts (403) or find engineering-blog posts with details.
- No public number for what share of recommendations come from the genome versus other signals.

## Failures and limits

### Takeaway
Human scoring does not scale (millions of songs in 25 years versus 30 million+ at on-demand rivals) and its reliability is unmeasured in public; attribute-nearest-neighbor ignores popularity, culture and lyric meaning, so similar-on-paper songs can miss the same audience; and US webcasting rules shape playlists independently of any recommender.

### Cited Findings
**Cost and speed**
- Pandora's catalog was "intentionally small", fewer than 2 million analyzed songs versus 30 million+ advertised elsewhere; the human-rating model is "unscalable" by Silicon Valley norms; royalties costly; radio-only format. [The Outline, 2017-01-11](https://theoutline.com/post/877/the-music-genome-project-isn-t-done)
- Expert annotation is "accurate, but prohibitively costly to scale". [Schedl et al., Music Recommender Systems, Recommender Systems Handbook ch. 13, 2015](https://www.ifs.tuwien.ac.at/~knees/teaching/rsss2019/RecSysHandbook2015_ch13_musicrec.pdf)
- Celma (c. 2008): Pandora's throughput of about 15,000 songs a month is a "clear scalability problem". [Celma thesis](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)

**Subjectivity and validity**
- Critique (opinion): the genome is "a sadly reductionist, anti-holistic view of what music is"; a complete taxonomy is "literally impossible"; analysts' cultural and temporal position shapes which features they notice. [Mandl, The Brooklyn Rail, 2014-11](https://brooklynrail.org/2014/11/music/feature-creeps/)
- No published inter-annotator agreement; redundancy only for a share of songs. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)
- Patent admits gene values are noisy and adds a variance floor. [US 7,003,515 B1](https://patents.google.com/patent/US7003515B1/en)
- Pandora authors found a 48-attribute subset predicts genre better than audio features in most cases (mean AUC 0.931 vs 0.905), but audio features beat the expert subset for Rap, Reggae and Disco, suggesting the subset "does not tell the whole story". [Prockup et al., ISMIR 2015](https://archives.ismir.net/ismir2015/paper/000276.pdf)

**Popularity blindness and audience mismatch**
- Popularity-blindness is a selling point: "completely popularity-blind" and a "level playing field". The same testimony admits the genome can match songs that "do not appeal to the same audience", which is why thumbs are layered on. [CRB Web IV, paras 6, 31, 33](https://www.crb.gov/rate/14-CRB-0001-WR/statements/Pandora/7_Written_Direct_Testimony_of_Timothy_Westergren_PUBLIC_pdf.pdf)

**Repetition and narrowing (weak evidence)**
- A trade-press columnist reported a thumbs-down being ignored and heavy ad/song repetition on a classical-holiday station; also cites an Edison study that about 5% of Americans account for 75% of Pandora listening time. [Radio Ink, 2016-12-18](https://radioink.com/2016/12/18/death-by-repetition/) (opinion/anecdote)
- Forum and Reddit users report that stations get repetitive after many thumbs-up and that taste narrows; no systematic study found and no source used the term "filter bubble". [search summary of user threads](https://bestcompany.com/streaming-music/pandora?review_filter=3) (low quality)
- Bieschke named the same risk in metrics terms: thumb-up rate and total hours reward heavy listeners; they moved to return rate and added diversity, novelty and surprise as "deeper metrics". [Bieschke slides](https://www.slideshare.net/slideshow/eric-bieschke-slides/28431664)

**Lyrics and culture**
- The genome does encode lyric tone (Angry, Sad, Love/Romance, Explicit lyrics) but not lyric meaning, and the 2015 research subset excluded melody and harmony altogether. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236); [Prockup et al.](https://archives.ismir.net/ismir2015/paper/000276.pdf)
- Genre meaning shifts over time and culture, so features that distinguish scenes at one moment can be insignificant later. [Mandl, Brooklyn Rail](https://brooklynrail.org/2014/11/music/feature-creeps/)

**Licensing rules shaping playlists (US)**
- 17 USC 114(j)(13): in any 3-hour period, no more than 3 songs from the same album (no more than 2 consecutive) and no more than 4 by the same featured artist or from the same box set (no more than 3 consecutive); no pre-announcing specific songs (114(d)(2)(C)(ii)). [17 USC 114, Cornell LII](https://www.law.cornell.edu/uscode/text/17/114)
- Pandora's S-1 warns that losing non-interactive status would force individual licenses; the statutory conditions constrain the service. [S-1, 2011](https://www.sec.gov/Archives/edgar/data/0001230276/000119312511032963/ds1.htm)
- Free-tier skip limits were historically 6 per hour and 24 per day (Music Business Worldwide, search summary); and 2026 court briefs between Pandora and the Mechanical Licensing Collective argue whether extra skips make Pandora an "interactive" service (search summary; briefs not opened). [MBW on the $4.99 tier](https://stg.musicbusinessworldwide.com/pandoras-free-tier-is-now-interactive-as-it-launches-a-new-4-99-services); [Pandora brief, 2026-02](https://www.musicbusinessworldwide.com/files/2026/02/Pandora-Matter-Pandora-Brief-2026-02-05.pdf)

### Inferences
- The genome's weakest point is economics, not the math: human-labeled catalogs trade breadth for quality, and Pandora's radio-only format let it live with a small catalog.
- The unmeasured inter-analyst noise is the real validity risk for any attribute-distance engine: if two raters disagree by a point on many genes, nearest-neighbor ranking among close items is partly noise. The patent's own variance floor is an admission of this.
- DMCA rules are specific to US non-interactive webcasting; they do not apply to a games/movies recommender, so they are not a reason to copy or avoid anything.

### Gaps
- No quantitative study of Pandora repetition or taste narrowing; only anecdotes.
- No data on how often genome-nearest songs were thumbed down (the corrective rate).
- Radio Ink's "2,000 focus traits" and the Reddit claims are unverified.

## The automated contrast: The Echo Nest, Spotify audio features, and the November 2024 restriction

### Takeaway
The Echo Nest (MIT Media Lab spin-out, acquired by Spotify in March 2014) derived audio descriptors by machine analysis plus web text mining; Spotify exposed a handful of 0-to-1 scores (danceability, energy, valence, acousticness, and so on). Spotify closed the audio-features and audio-analysis endpoints to new apps on 2024-11-27 with no stated reason beyond security.

### Cited Findings
- The Echo Nest: founded 2005 from Tristan Jehan's and Brian Whitman's MIT Media Lab work; database of about 30 million songs derived automatically by web crawling, data mining and signal processing; API used by over 7,000 developers; shut 2016-05-31. [Wikipedia: The Echo Nest](https://en.wikipedia.org/wiki/The_Echo_Nest)
- Acquired by Spotify, announced 2014-03-06; price reported as about 49.7 million euros (Wikipedia) or "just E50M" (Music Business Worldwide headline). [Wikipedia: The Echo Nest](https://en.wikipedia.org/wiki/The_Echo_Nest); [MBW](https://www.musicbusinessworldwide.com/spotify-acquired-echo-nest-just-e50m/)
- Spotify's audio-feature fields (docs page now labeled "Deprecated"): acousticness, danceability, energy, valence (0.0 to 1.0); instrumentalness, liveness, speechiness; loudness (dB); tempo (BPM); key; mode; time_signature. Energy is "a perceptual measure of intensity and activity". [Spotify Web API reference: Get Track's Audio Features](https://developer.spotify.com/documentation/web-api/reference/get-audio-features)
- The Echo Nest never published the formulas; a 2019 arXiv paper says danceability uses beat strength, tempo stability and tempo, and energy uses loudness and segment durations (search summary of the paper; I did not open it). [arXiv 1905.08076](https://arxiv.org/pdf/1905.08076)
- Paul Lamere on speechiness (2011-11-04): a 0-to-1 score that cleanly separated banjo from stand-up comedy on Steve Martin tracks; labeled an alpha release that "may" change; no validation against human labels. [Lamere, Music Machinery, 2011-11-04](https://musicmachinery.substack.com/p/speechiness-is-it-banjo-or-banter)
- 2024-11-27 Spotify developer blog: apps registered from that date (and development-mode apps without a pending extension) lose Related Artists, Recommendations, Audio Features, Audio Analysis, Featured/Category Playlists, 30-second previews in multi-get responses, and algorithmic and Spotify-owned editorial playlists; existing extended-mode apps unaffected; stated aim: a "more secure platform". [Spotify for Developers, 2024-11-27](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- TechCrunch: a spokesperson cited "ongoing work to address the security challenges"; the outlet reports the change targets developers Spotify believes misused the API, including scraping; no advance warning. [TechCrunch, Maxwell Zeff, 2024-11-27](https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features)
- Developer speculation that the cut was about AI scraping or competition is unconfirmed by Spotify. [Music Business Worldwide, 2024-12-02](https://musicbusinessworldwide.com/are-spotifys-changes-to-third-party-developer-access-meant-to-combat-ai-scraping)
- A Feb 2026 article says further restrictions followed (low authority; I did not verify). [Headphonesty, 2026-02](https://www.headphonesty.com/2026/02/spotify-crackdown-thousands-third-party-music-apps/)
- How well machines recover expert genes (Pandora authors, 2015): audio models predict swing and shuffle well (AUC 0.907 and 0.919), but continuous perceptual attributes poorly: back-beat strength R-squared 0.40, danceability 0.53, and across continuous timbre attributes a mean R-squared of 0.266; "vocal grittiness" is called "not modeled very well at all". [Prockup et al., ISMIR 2015, Tables 8-9](https://archives.ismir.net/ismir2015/paper/000276.pdf)

### Inferences
- Contrast in kind: Pandora = about 2,500 analyst-hours per 10,000 songs at 15 minutes each (my arithmetic), rich and interpretable, slow; Echo Nest = fast, whole-catalog (about 30 million songs), narrow (about a dozen scalar features), opaque. Pandora's own research found machine features recover rhythmic genes but not perceptual ones.
- For games and movies there is no audio-feature equivalent, so the Echo Nest path (machine-derived from content) would need other machine sources (text, tags, trailers, metadata), which is a different problem. (my inference)
- Anyone building on Spotify audio features after Nov 2024 cannot rely on that endpoint; a lesson in not making a recommender depend on a third party's derived attributes.

### Gaps
- Current (October 2026) Spotify status of these endpoints beyond the "Deprecated" docs label: not independently verified.
- The Echo Nest feature formulas: unpublished; the arXiv claim is a summary I did not open.
- Fast Company 2011 "Echo Nest makes Pandora look like a transistor radio" (a direct comparison) was not opened.

## Academic comparisons of expert-annotated features versus collaborative filtering (with numbers)

### Takeaway
I found no published head-to-head of Pandora-style expert genes versus collaborative filtering for recommendation. The nearest evidence: an expert-plus-audio hybrid versus CF and audio in a 288-person blind test (CF best on unfamiliar songs), a small test where rating-based similarity beat signal-based content similarity, and Pandora-authored work showing expert genes carry more genre information than audio features.

### Cited Findings
- Celma user study (PhD thesis, 2008/2009; the 2010 book is the published version, not opened): 288 participants rated 5,573 tracks (1 to 5), blind, 30-second clips, no metadata, three recommenders: collaborative filtering (Last.fm), audio content-based (CB), and a hybrid (HY) of AllMusic.com expert "related artists" re-ranked by audio similarity. [Celma thesis, ch. 7](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
  - Share of recommendations the user did not know (novel): CF 71.69%, HY 78.34%, CB 80.97%. Average rating of those unknown songs: CF 3.03, HY 2.77, CB 2.57 (all "recall"-groups rated much higher, about 3.6 to 4.6). [Celma thesis, Table 7.1](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
  - For songs the user already knew, no statistically significant difference among the three; for unknown songs, ANOVA F = 29.13 (p well below 0.05) and CF scored higher than HY and CB. [Celma thesis, ch. 7](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
  - Celma's reading: adding metadata and an explanation of why a song was recommended could "drastically" raise perceived relevance of novel songs (his belief, not tested). [Celma thesis, 7.2-7.3](https://mtg.upf.edu/static/media/PhD_ocelma.pdf)
- Slaney and White, ISMIR 2007: 1.5 million ratings from 380,911 users on 1,000 jazz songs; the rating-based similarity found same-artist matches "almost twice as well" as a signal-based content benchmark; in an 18-listener test the rating playlist got 16 "most similar" votes (content 1, random 1) and the random list got 13 of the "least similar" votes (content 4, ratings 1). [Slaney and White, ISMIR 2007](https://archives.ismir.net/ismir2007/paper/000479.pdf)
- Barrington, Oda, Lanckriet, ISMIR 2009 ("Smarter than Genius?"): human evaluation of Apple Genius (collaborative) versus artist-similarity and audio auto-tag similarity; the audio-tag system was "as good as" Genius under some conditions; Genius found links beyond same-artist matching. Numbers not captured. [UCSD press coverage via search summary](https://jacobsschool.ucsd.edu/news/release/897)
- Survey statement: audio-content methods "are usually outperformed by collaborative filtering", while expert annotations are accurate but costly; content is still preferred for cold start and popularity-bias. [Schedl et al., RecSys Handbook ch. 13, 2015](https://www.ifs.tuwien.ac.at/~knees/teaching/rsss2019/RecSysHandbook2015_ch13_musicrec.pdf)
- Pandora authors, ISMIR 2015: mean AUC for genre from 48 expert attributes 0.931, from audio features 0.905, from audio-predicted attributes 0.897, from audio plus predicted attributes 0.915 (training set over one million songs, 70/30 split). Expert labels win on average; audio wins on Rap, Reggae and Disco. [Prockup et al., Table 6](https://archives.ismir.net/ismir2015/paper/000276.pdf)
- Pandora authors, TISMIR 2025: the released 21,320-track MGPHot set (Billboard Hot 100, 1958 to 2022) has no CF comparison, no agreement stats, no cost figures. [TISMIR 2025](https://transactions.ismir.net/articles/10.5334/tismir.236)
- Van den Oord et al., NeurIPS 2013: content-based deep model predicts collaborative latent factors from audio when usage data is missing; strong cold-start use; numbers not captured. [NIPS 2013](https://papers.nips.cc/paper/5004-deep-content-based-music-recommendation)

### Inferences
- Honest evidence summary: CF beats content features at predicting what users like once there is data; expert annotations beat machine features at describing music; nobody published expert genes versus CF head to head. Pandora's own architecture (genome for cold start, CF and thumbs on top) matches that evidence.
- The Celma HY arm is the closest analogue to expert knowledge and it trailed CF on unfamiliar songs (2.77 vs 3.03 on a 5-point scale), but it is expert related-artists plus audio, not a gene vector.

### Gaps
- No numbers for Barrington et al., Slaney 2011 ("does content matter?"), Berenzweig et al., or van den Oord (full texts not opened).
- Celma's 2010 book itself not opened; used the thesis it derives from.
- Nothing equivalent for video games or movies surfaced in this task (out of scope here).

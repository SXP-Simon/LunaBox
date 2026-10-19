package service

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"lunabox/backend/appconf"
)

func newPosterStatsTestService(t *testing.T) *StatsService {
	t.Helper()
	db, err := sql.Open("duckdb", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, query := range []string{
		`CREATE TABLE games (id TEXT, name TEXT, company TEXT, cover_url TEXT, cover_source_url TEXT)`,
		`CREATE TABLE play_sessions (game_id TEXT, start_time TIMESTAMPTZ, duration INTEGER)`,
		`SET TimeZone = 'Asia/Shanghai'`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	s := NewStatsService()
	s.Init(context.Background(), db, &appconf.AppConfig{})
	return s
}

func TestPosterGamesIncludesAllGamesAndCompanies(t *testing.T) {
	s := newPosterStatsTestService(t)
	for i := 0; i < 120; i++ {
		id := fmt.Sprintf("game-%03d", i)
		if _, err := s.db.Exec(`INSERT INTO games VALUES (?, ?, 'Developer', '', 'https://example.com/cover.jpg')`, id, id); err != nil {
			t.Fatal(err)
		}
		if _, err := s.db.Exec(`INSERT INTO play_sessions VALUES (?, '2026-10-01 20:00:00+08', ?)`, id, 120-i); err != nil {
			t.Fatal(err)
		}
	}
	games, err := s.GetPosterGames("2026-01-01", "2026-10-18")
	if err != nil {
		t.Fatal(err)
	}
	if len(games) != 120 {
		t.Fatalf("want all 120 games, got %d", len(games))
	}
	for i, game := range games {
		if game.TotalDuration != 120-i || game.Company != "Developer" || game.CoverURL != "https://example.com/cover.jpg" {
			t.Fatalf("unexpected game %d: %+v", i, game)
		}
	}
}

func TestPosterGamesLocalCalendarBoundariesAndEmptyMetadata(t *testing.T) {
	s := newPosterStatsTestService(t)
	for _, query := range []string{
		`INSERT INTO games VALUES ('a', 'A', NULL, '/local/covers/a.jpg', NULL), ('b', 'B', NULL, NULL, NULL), ('zero', 'Zero', '', '', '')`,
		`INSERT INTO play_sessions VALUES
		 ('a', '2026-10-17 15:59:59+00', 1000),
		 ('a', '2026-10-17 16:00:00+00', 30),
		 ('a', '2026-10-18 15:59:59+00', 20),
		 ('a', '2026-10-18 16:00:00+00', 2000),
		 ('b', '2026-10-18 12:00:00+08', 50),
		 ('zero', '2026-10-18 12:00:00+08', 0)`,
	} {
		if _, err := s.db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	games, err := s.GetPosterGames("2026-10-18", "2026-10-18")
	if err != nil {
		t.Fatal(err)
	}
	if len(games) != 2 || games[0].GameID != "a" || games[1].GameID != "b" || games[0].TotalDuration != 50 || games[1].TotalDuration != 50 {
		t.Fatalf("unexpected boundary aggregation or tie order: %+v", games)
	}
	if games[0].Company != "" || games[0].CoverURL != "/local/covers/a.jpg" || games[1].CoverURL != "" {
		t.Fatalf("unexpected metadata: %+v", games)
	}
	empty, err := s.GetPosterGames("2025-01-01", "2025-12-31")
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("empty range: %v %v", empty, err)
	}
}

func TestPosterGamesRejectsInvalidRanges(t *testing.T) {
	s := newPosterStatsTestService(t)
	for _, dates := range [][2]string{{"", "2026-10-18"}, {"2026-02-30", "2026-10-18"}, {"2026-10-19", "2026-10-18"}, {"2026-01-01' OR 1=1 --", "2026-10-18"}} {
		if _, err := s.GetPosterGames(dates[0], dates[1]); err == nil {
			t.Fatalf("accepted invalid range %v", dates)
		}
	}
}

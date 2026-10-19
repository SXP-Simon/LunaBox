package service

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"lunabox/backend/appruntime"
)

type posterSaveRuntime struct {
	appruntime.Runtime
	path    string
	options appruntime.SaveDialogOptions
}

func (r *posterSaveRuntime) SaveFile(options appruntime.SaveDialogOptions) (string, error) {
	r.options = options
	return r.path, nil
}

func TestExportRenderedPosterPreservesHDPNG(t *testing.T) {
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewGray(image.Rect(0, 0, 3240, 4320))); err != nil {
		t.Fatal(err)
	}
	runtime := &posterSaveRuntime{Runtime: appruntime.Unavailable(), path: filepath.Join(t.TempDir(), "poster.png")}
	s := NewTemplateService()
	s.SetRuntime(runtime)
	if err := s.ExportRenderedHTML("data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes())); err != nil {
		t.Fatal(err)
	}
	saved, err := os.ReadFile(runtime.path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(saved, encoded.Bytes()) {
		t.Fatal("saved PNG differs from canvas output")
	}
	config, err := png.DecodeConfig(bytes.NewReader(saved))
	if err != nil || config.Width != 3240 || config.Height != 4320 {
		t.Fatalf("unexpected PNG config: %+v, %v", config, err)
	}
	if filepath.Ext(runtime.options.Filename) != ".png" || len(runtime.options.Filters) != 1 || runtime.options.Filters[0].Pattern != "*.png" {
		t.Fatalf("unexpected save dialog: %+v", runtime.options)
	}
}

func TestExportRenderedPosterCancellationAndInvalidData(t *testing.T) {
	s := NewTemplateService()
	s.SetRuntime(&posterSaveRuntime{Runtime: appruntime.Unavailable()})
	if err := s.ExportRenderedHTML(base64.StdEncoding.EncodeToString([]byte("cancelled"))); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if err := s.ExportRenderedHTML("not base64!"); err == nil {
		t.Fatal("accepted malformed base64")
	}
}

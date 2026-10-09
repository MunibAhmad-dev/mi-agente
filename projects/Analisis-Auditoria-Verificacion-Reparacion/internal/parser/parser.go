// Package parser implements multi-language structural parsing.
//
// In production the engine plugs tree-sitter grammars (MIT) through the
// ToolAdapter boundary; this package carries the language-agnostic scanning
// strategy plus first-class Go support (stdlib go/parser) so the engine is
// offline-capable with zero grammars installed.
package parser

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Lang identifies a supported language.
type Lang string

const (
	LangGo         Lang = "go"
	LangPython     Lang = "python"
	LangJavaScript Lang = "javascript"
	LangTypeScript Lang = "typescript"
)

// FuncDecl is a discovered function/method.
type FuncDecl struct {
	Name       string
	Recv       string // receiver type for methods ("" for plain functions)
	File       string
	Line       int
	EndLine    int
	Exported   bool
	IsTest     bool
	Language   Lang
	DocComment string
}

// RouteDecl is a discovered HTTP route registration like r.Get("/x", h).
type RouteDecl struct {
	Method string
	Path   string
	Line   int
	File   string
}

// Import is a discovered package import.
type Import struct {
	Path string
	File string
	Line int
	Used bool
}

// FileModel is the structural model of one source file.
type FileModel struct {
	Path     string
	Lang     Lang
	Imports  []Import
	Funcs    []FuncDecl
	Calls    map[string]int // callee name -> call count
	Routes   []RouteDecl
	Comments []string // full doc comments
}

// CallName resolves p.Q.Sel(...) to "p.Sel" or "Sel".
func CallName(call *ast.CallExpr) string {
	switch fn := call.Fun.(type) {
	case *ast.SelectorExpr:
		if ident, ok := fn.X.(*ast.Ident); ok {
			return ident.Name + "." + fn.Sel.Name
		}
		return fn.Sel.Name
	case *ast.Ident:
		return fn.Name
	}
	return ""
}

func isTestFunc(fd *ast.FuncDecl) bool {
	return fd.Recv == nil && strings.HasPrefix(fd.Name.Name, "Test") && len(fd.Name.Name) > 4
}

// ParseGoFile parses one Go file.
func ParseGoFile(path string) (*FileModel, error) {
	src, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, src, parser.ParseComments)
	if err != nil {
		// Unparseable file is still a structural fact; return partial model.
		return &FileModel{Path: path, Lang: LangGo}, nil
	}
	fm := &FileModel{Path: path, Lang: LangGo, Calls: map[string]int{}}

	for _, imp := range f.Imports {
		p := strings.Trim(imp.Path.Value, `"`)
		fm.Imports = append(fm.Imports, Import{Path: p, File: path, Line: fset.Position(imp.Pos()).Line})
	}
	// Track which top-level package names are referenced (import used?).
	used := map[string]bool{}
	for _, decl := range f.Decls {
		if gd, ok := decl.(*ast.GenDecl); ok && gd.Tok == token.IMPORT {
			continue
		}
		ast.Inspect(decl, func(n ast.Node) bool {
			if sel, ok := n.(*ast.SelectorExpr); ok {
				if ident, ok := sel.X.(*ast.Ident); ok {
					used[ident.Name] = true
				}
			}
			if call, ok := n.(*ast.CallExpr); ok {
				name := CallName(call)
				if name != "" {
					fm.Calls[name]++
				}
			}
			return true
		})
	}
	for i := range fm.Imports {
		base := filepath.Base(strings.TrimSuffix(fm.Imports[i].Path, filepath.Ext(fm.Imports[i].Path)))
		alias := base
		if fm.Imports[i].Path != "" && strings.Contains(base, "v") && len(base) == 2 { // foo/v2
			alias = strings.TrimSuffix(base, "/v2")
		}
		fm.Imports[i].Used = used[alias] || used[base]
	}

	for _, decl := range f.Decls {
		fd, ok := decl.(*ast.FuncDecl)
		if !ok || fd.Body == nil {
			continue
		}
		nd := FuncDecl{
			Name:     fd.Name.Name,
			File:     path,
			Line:     fset.Position(fd.Pos()).Line,
			EndLine:  fset.Position(fd.End()).Line,
			Exported: fd.Name.IsExported(),
			IsTest:   isTestFunc(fd),
			Language: LangGo,
		}
		if fd.Recv != nil && len(fd.Recv.List) > 0 {
			nd.Recv = recvTypeName(fd.Recv.List[0].Type)
		}
		if fd.Doc != nil {
			nd.DocComment = fd.Doc.Text()
		}
		fm.Funcs = append(fm.Funcs, nd)
		// Route registrations inside the body: r.Get("/x", ...), mux.HandleFunc("/y", ...)
		ast.Inspect(fd.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			if name := CallName(call); name != "" && len(call.Args) >= 2 {
				if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
					m := sel.Sel.Name
					switch m {
					case "Get", "Post", "Put", "Patch", "Delete", "Head", "Options", "Handle", "HandleFunc":
						if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == token.STRING {
							method := strings.ToUpper(m)
							if m == "Handle" || m == "HandleFunc" {
								method = "ANY"
							}
							fm.Routes = append(fm.Routes, RouteDecl{
								Method: method,
								Path:   strings.Trim(lit.Value, "`\""),
								Line:   fset.Position(call.Pos()).Line,
								File:   path,
							})
						}
					}
				}
			}
			return true
		})
	}
	return fm, nil
}

func recvTypeName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.StarExpr:
		return recvTypeName(t.X)
	case *ast.Ident:
		return t.Name
	case *ast.IndexExpr: // generic receiver Foo[T]
		return recvTypeName(t.X)
	}
	return ""
}

// DetectLang maps a file path to a language.
func DetectLang(path string) Lang {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".go":
		return LangGo
	case ".py":
		return LangPython
	case ".js", ".mjs", ".cjs":
		return LangJavaScript
	case ".ts", ".tsx":
		return LangTypeScript
	}
	return ""
}

// Scan walks projectRoot (skipping common noise dirs), parses supported files
// and returns per-file models plus aggregate references.
func Scan(projectRoot string) (*ScanResult, error) {
	res := &ScanResult{Files: map[string]*FileModel{}, References: map[string]int{}}
	err := filepath.WalkDir(projectRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			base := d.Name()
			if base == ".git" || base == "node_modules" || base == "vendor" ||
				base == "__pycache__" || base == "dist" || base == "build" || base == ".freebuff" {
				return filepath.SkipDir
			}
			return nil
		}
		lang := DetectLang(path)
		if lang != LangGo { // non-Go: still record for inventory, grammar adapters parse later
			if lang != "" {
				res.OtherFiles = append(res.OtherFiles, path)
			}
			return nil
		}
		if strings.HasSuffix(path, "_test.go") {
			res.TestFiles = append(res.TestFiles, path)
		}
		fm, err := ParseGoFile(path)
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		res.Files[path] = fm
		for _, fn := range fm.Funcs {
			ref := fn.Name
			if fn.Recv != "" {
				ref = fn.Recv + "." + fn.Name
			}
			res.Funcs = append(res.Funcs, fn)
			res.References[ref]++
		}
		for callee, n := range fm.Calls {
			res.References[callee] += n
		}
		res.Routes = append(res.Routes, fm.Routes...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(res.OtherFiles)
	sort.Strings(res.TestFiles)
	return res, nil
}

// ScanResult aggregates the scan.
type ScanResult struct {
	Files      map[string]*FileModel
	TestFiles  []string
	OtherFiles []string
	Funcs      []FuncDecl
	Routes     []RouteDecl
	References map[string]int // name -> inbound reference count (calls/declarations)
}

// InboundRefs returns how many references a symbol has (0 = dead candidate).
func (r *ScanResult) InboundRefs(symbol string) int { return r.References[symbol] }

// Package jsonutil provides tolerant JSON helpers.
package jsonutil

import "encoding/json"

// Unmarshal decodes JSON data into v.
func Unmarshal(data []byte, v any) error {
	return json.Unmarshal(data, v)
}

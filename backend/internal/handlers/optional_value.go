package handlers

import (
	"bytes"
	"encoding/json"
)

// OptionalValue 用于 PATCH 风格接口区分“字段未传入”和“字段显式传 null”。
type OptionalValue[T any] struct {
	Set   bool
	Value *T
}

func (o *OptionalValue[T]) UnmarshalJSON(data []byte) error {
	o.Set = true

	if bytes.Equal(data, []byte("null")) {
		o.Value = nil
		return nil
	}

	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}

	o.Value = &value
	return nil
}

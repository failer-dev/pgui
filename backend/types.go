package main

type ConnectionStatus struct {
	Connected            bool   `json:"connected"`
	Mode                 string `json:"mode"`
	Database             string `json:"database,omitempty"`
	Host                 string `json:"host,omitempty"`
	Port                 string `json:"port,omitempty"`
	User                 string `json:"user,omitempty"`
	AutoConnectAttempted bool   `json:"autoConnectAttempted"`
	Error                string `json:"error,omitempty"`
}

type SchemaTables struct {
	Name   string   `json:"name"`
	Tables []string `json:"tables"`
}

type TableColumn struct {
	Name          string `json:"name"`
	DataType      string `json:"dataType"`
	Nullable      bool   `json:"nullable"`
	DefaultValue  string `json:"defaultValue,omitempty"`
	IsPrimaryKey  bool   `json:"isPrimaryKey"`
	IsEditable    bool   `json:"isEditable"`
	DisplayType   string `json:"displayType"`
}

type TableMetadata struct {
	Columns    []TableColumn `json:"columns"`
	PrimaryKey []string      `json:"primaryKey"`
	Editable   bool          `json:"editable"`
}

type Pagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalRows  int `json:"totalRows"`
	TotalPages int `json:"totalPages"`
}

type TableRowsResponse struct {
	Columns    []TableColumn          `json:"columns"`
	Rows       []map[string]any       `json:"rows"`
	Pagination Pagination             `json:"pagination"`
	PrimaryKey []string               `json:"primaryKey"`
	Editable   bool                   `json:"editable"`
	QueryTime  int64                  `json:"queryTimeMs"`
}

type SaveChange struct {
	PrimaryKey map[string]any `json:"primaryKey"`
	Values     map[string]any `json:"values"`
}

type SaveRequest struct {
	Changes []SaveChange `json:"changes"`
}

type SaveResponse struct {
	Updated int `json:"updated"`
}

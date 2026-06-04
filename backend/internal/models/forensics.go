package models

import "time"

// Forensics mirrors the Mongoose schema in lib/db/models/forensicsModel.js.
type Forensics struct {
	ID            string    `bson:"_id"            json:"_id"`
	ForensicsType string    `bson:"forensicsType"  json:"forensicsType"`
	EventTime     time.Time `bson:"eventTime"      json:"eventTime"`
	Content       string    `bson:"content"        json:"content"`
}

package com.spraylog.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "fields")
public class Field {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "area_acres", nullable = false, precision = 6, scale = 2)
    private BigDecimal areaAcres;

    @Column(name = "location_note", length = 255)
    private String locationNote;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected Field() {
    }

    public Field(String name, BigDecimal areaAcres, String locationNote) {
        this.name = name;
        this.areaAcres = areaAcres;
        this.locationNote = locationNote;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public BigDecimal getAreaAcres() { return areaAcres; }
    public String getLocationNote() { return locationNote; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public void setName(String name) { this.name = name; }
    public void setAreaAcres(BigDecimal areaAcres) { this.areaAcres = areaAcres; }
    public void setLocationNote(String locationNote) { this.locationNote = locationNote; }
}
package com.spraylog.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "crops")
public class Crop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "crop_name", nullable = false, length = 100)
    private String cropName;

    @Column(name = "variety", length = 100)
    private String variety;

    @Column(name = "sowing_date")
    private LocalDate sowingDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private CropStatus status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "field_id", nullable = false)
    private Field field;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected Crop() {
    }

    public Crop(String cropName, String variety, LocalDate sowingDate, Field field) {
        this.cropName = cropName;
        this.variety = variety;
        this.sowingDate = sowingDate;
        this.field = field;
        this.status = CropStatus.ACTIVE;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = CropStatus.ACTIVE;
        }
    }

    public Long getId() { return id; }
    public String getCropName() { return cropName; }
    public String getVariety() { return variety; }
    public LocalDate getSowingDate() { return sowingDate; }
    public CropStatus getStatus() { return status; }
    public Field getField() { return field; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public void setCropName(String cropName) { this.cropName = cropName; }
    public void setVariety(String variety) { this.variety = variety; }
    public void setSowingDate(LocalDate sowingDate) { this.sowingDate = sowingDate; }
    public void setStatus(CropStatus status) { this.status = status; }
    public void setField(Field field) { this.field = field; }
}
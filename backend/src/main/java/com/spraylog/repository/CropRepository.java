package com.spraylog.repository;

import com.spraylog.entity.Crop;
import com.spraylog.entity.Field;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CropRepository extends JpaRepository<Crop, Long> {

    List<Crop> findByField(Field field);
}